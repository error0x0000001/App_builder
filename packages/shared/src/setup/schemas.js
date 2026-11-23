import { z } from 'zod';
import { getAdapterMeta } from './adapters.js';
import { ruleExtraFields } from '../automation.js';

/** Odoo-style list limits: small pages, capped counts. */
export const SETUP_LIST = Object.freeze({ defaultLimit: 80, maxLimit: 200, countCap: 10_000, bulkMax: 500 });

export const labelKey = (collection) => (collection.columns.find((c) => c.type === 'link') ?? collection.columns[0]).key;
export const statusKey = (collection) => collection.columns.find((c) => c.type === 'status')?.key ?? null;

/* ---------- validation: one schema per page, built once ---------- */
const memo = new Map();
const cached = (id, build) => { if (!memo.has(id)) memo.set(id, build()); return memo.get(id); };

const fieldSchema = (f) => {
  if (f.type === 'bool') return z.boolean();
  if (f.type === 'select' && f.options?.length) return z.enum(f.options);
  return z.string().max(2000);
};

/** PATCH body for a settings page: any subset of its fields, nothing else. */
export const settingsPatchSchema = (page) => cached(`s:${page.key}`, () => {
  const shape = Object.fromEntries(page.sections.flatMap((s) => s.fields ?? []).map((f) => [f.key, fieldSchema(f)]));
  return z.object(shape).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
});

const columnSchema = (c) => {
  if (c.type === 'check') return z.boolean();
  if (c.type === 'number') return z.union([z.number(), z.string().max(40)]);
  if ((c.type === 'status' || c.type === 'select') && c.options?.length) return c.type === 'select' ? z.enum(c.options) : z.string().max(100);
  return z.string().max(500);
};

const formFieldSchema = (f) => (f.type === 'select' && f.options?.length ? z.enum(f.options) : f.type === 'check' ? z.boolean() : z.string().trim().max(500));

/** Record body: create requires the label column; update is any subset. Adapter pages use their own forms. */
export const recordSchemas = (collection) => cached(`r:${collection.key}`, () => {
  const adapter = getAdapterMeta(collection.key);
  if (adapter?.createFields || adapter?.editFields) {
    const build = (fields) => z.object(Object.fromEntries((fields ?? []).map((f) => [f.key, f.required ? formFieldSchema(f).refine((v) => v !== '', 'Required') : formFieldSchema(f).optional()]))).strict();
    return { create: build(adapter.createFields), update: build(adapter.editFields) };
  }
  const shape = Object.fromEntries([...collection.columns.map((c) => [c.key, columnSchema(c)]), ...ruleExtraFields(collection.key).filter((x) => !collection.columns.some((c) => c.key === x.key)).map((x) => [x.key, x.type === 'select' ? z.enum(['', ...x.options]) : z.string().max(2000)])]);
  const label = labelKey(collection);
  return {
    create: z.object({ ...shape, [label]: z.string().trim().min(1, 'Required').max(500) }).partial().required({ [label]: true }).strict(),
    update: z.object(shape).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update'),
  };
});

export const settingsDefaults = (page) =>
  Object.fromEntries(page.sections.flatMap((s) => s.fields ?? []).map((f) => [f.key, f.default]));

/* ---------- request shapes shared by API + UI ---------- */
const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
export const setupListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(SETUP_LIST.maxLimit).optional(),
  after: z.string().max(512).optional(),
  q: z.string().trim().max(100).optional(),
  view: z.string().max(100).optional(),
  sort: z.string().max(60).regex(/^[A-Za-z0-9_]+$/).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  parent: z.string().uuid().optional(),
  total: bool.optional(),
});
export const setupIdsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(SETUP_LIST.bulkMax) });
export const setupSettingsBodySchema = z.object({ version: z.number().int().min(0), values: z.record(z.string(), z.unknown()) });

/* ---------- record form (dialog) definition: one source for UI + validation ---------- */
const FORM_TYPE = { check: 'check', number: 'text', select: 'select', status: 'select', datetime: 'text', link: 'text', text: 'text' };

/** Fields shown in the create/edit dialog for a collection. Adapter pages declare their own (invite = email + role). */
export const recordFormFields = (collection, mode) => {
  const adapter = getAdapterMeta(collection.key);
  const declared = mode === 'create' ? adapter?.createFields : adapter?.editFields;
  if (declared) return declared;
  const label = labelKey(collection);
  const extras = ruleExtraFields(collection.key).filter((x) => !collection.columns.some((c) => c.key === x.key)).map((x) => ({ ...x, type: x.type === 'textarea' ? 'text' : x.type, required: false }));
  return [...collection.columns.map((c) => ({
    key: c.key, label: c.label, type: c.options?.length && (c.type === 'select' || c.type === 'status') ? 'select' : FORM_TYPE[c.type] ?? 'text',
    options: c.options, required: mode === 'create' && c.key === label,
  })), ...extras];
};

/** Dialog schema = the API schema, but blank optional selects are treated as "not set" instead of invalid. */
export const recordFormSchema = (collection, mode) => {
  const blankSelects = recordFormFields(collection, mode).filter((f) => f.type === 'select' && !f.required).map((f) => f.key);
  const strip = (value) => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k, v]) => !(blankSelects.includes(k) && v === ''))) : value);
  return z.preprocess(strip, recordSchemas(collection)[mode]);
};

/** Validation for a tool dialog, from the tool definition the API returned (so the browser never needs the registry). */
export const toolInputSchemaFrom = (meta) => {
  if (!meta) return z.object({}).strict();
  const shape = Object.fromEntries(meta.fields.map((f) => {
    let s = f.type === 'bool' ? z.boolean() : f.type === 'select' ? z.enum(f.options) : z.string().max(f.key === 'csv' ? 2_000_000 : 500);
    if (f.required) s = f.type === 'bool' ? s.refine((v) => v === true, 'Required') : s.refine((v) => v !== '', 'Required');
    else s = s.optional();
    return [f.key, s];
  }));
  return z.object(shape).strict();
};
