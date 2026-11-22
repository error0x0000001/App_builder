import { z } from 'zod';
import registry from './registry.generated.json' with { type: 'json' };
import { getAdapterMeta } from './adapters.js';

/** Setup registry: generated from the design mock-up (tools/setup/build-registry.cjs). One definition drives UI + API + validation. */
export const SETUP_TREE = registry.tree;
export const SETUP_PAGES = registry.pages;
export const SETUP_COUNTS = registry.counts;
export const getSetupPage = (key) => SETUP_PAGES[key] ?? null;

/** Odoo-style list limits: small pages, capped counts. */
export const SETUP_LIST = Object.freeze({ defaultLimit: 80, maxLimit: 200, countCap: 10_000, bulkMax: 500 });

/** Collections that back special pages (not in the tree). Same shape as a list page. */
export const INTERNAL_COLLECTIONS = Object.freeze({
  'debug-trace-flags': { key: 'debug-trace-flags', name: 'User Trace Flags', kind: 'list', newLabel: 'New', columns: [
    { key: 'monitored_user', label: 'Monitored User', type: 'link' }, { key: 'debug_level', label: 'Debug Level', type: 'select', options: ['SFDC_DevConsole', 'Finest', 'Info', 'Warn'] },
    { key: 'start_date', label: 'Start Date', type: 'text' }, { key: 'expiration_date', label: 'Expiration Date', type: 'text' }], views: [], bulkActions: [] },
  'debug-log-entries': { key: 'debug-log-entries', name: 'Debug Logs', kind: 'list', newLabel: null, columns: [
    { key: 'user', label: 'User', type: 'link' }, { key: 'application', label: 'Application', type: 'text' }, { key: 'operation', label: 'Operation', type: 'text' },
    { key: 'time', label: 'Time', type: 'text' }, { key: 'status', label: 'Status', type: 'status', options: ['Success', 'Assertion Failed', 'Fatal Error'] }, { key: 'size', label: 'Log Size', type: 'text' }], views: [], bulkActions: [] },
  'sharing-defaults': { key: 'sharing-defaults', name: 'Organization-Wide Defaults', kind: 'list', newLabel: null, columns: [
    { key: 'object', label: 'Object', type: 'link' },
    { key: 'default_internal_access', label: 'Default Internal Access', type: 'select', options: ['Private', 'Public Read Only', 'Public Read/Write', 'Public Read/Write/Transfer', 'Public Full Access', 'Controlled by Parent'] },
    { key: 'default_external_access', label: 'Default External Access', type: 'select', options: ['Private', 'Public Read Only', 'Controlled by Parent'] },
    { key: 'grant_access_using_hierarchies', label: 'Grant Access Using Hierarchies', type: 'check' }], views: [], bulkActions: [] },
  'object-manager-objects': { key: 'object-manager-objects', name: 'Objects', kind: 'list', newLabel: 'Create', columns: [
    { key: 'label', label: 'Label', type: 'link' }, { key: 'api_name', label: 'API Name', type: 'text' }, { key: 'type', label: 'Type', type: 'status', options: ['Standard', 'Custom'] }, { key: 'description', label: 'Description', type: 'text' }], views: [], bulkActions: [] },
  'object-manager-fields': { key: 'object-manager-fields', name: 'Fields & Relationships', kind: 'list', newLabel: 'New', columns: [
    { key: 'field_label', label: 'Field Label', type: 'link' }, { key: 'object', label: 'Object', type: 'text' },
    { key: 'data_type', label: 'Data Type', type: 'select', options: ['Text', 'Text Area', 'Number', 'Currency', 'Percent', 'Checkbox', 'Date', 'Date/Time', 'Email', 'Phone', 'URL', 'Picklist', 'Lookup', 'Formula'] },
    { key: 'required', label: 'Required', type: 'check' }], views: [], bulkActions: [] },
});

/** Everything that stores records: tree list pages + internal collections. */
export const getCollection = (key) => {
  const page = SETUP_PAGES[key];
  if (page?.kind === 'list') return page;
  if (page?.kind === 'tree') return TREE_COLLECTION(page);
  return INTERNAL_COLLECTIONS[key] ?? null;
};
const TREE_COLLECTION = (page) => ({ key: page.key, name: page.name, kind: 'list', newLabel: 'Add', columns: [{ key: 'name', label: 'Role', type: 'link' }, { key: 'assigned_to', label: 'Assigned To', type: 'text' }], views: [], bulkActions: [] });

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
  const shape = Object.fromEntries(collection.columns.map((c) => [c.key, columnSchema(c)]));
  const label = labelKey(collection);
  return {
    create: z.object({ ...shape, [label]: z.string().trim().min(1, 'Required').max(500) }).partial().required({ [label]: true }).strict(),
    update: z.object(shape).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update'),
  };
});

export const settingsDefaults = (page) =>
  Object.fromEntries(page.sections.flatMap((s) => s.fields ?? []).map((f) => [f.key, f.default]));

/** Flatten the tree to [{ key, name, path }] (used by search / quick find). */
export const SETUP_INDEX = Object.values(SETUP_PAGES).map(({ key, name, path, kind }) => ({ key, name, path, kind }));

/* ---------- request shapes shared by API + UI ---------- */
const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
export const setupListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(SETUP_LIST.maxLimit).optional(),
  after: z.string().max(512).optional(),
  q: z.string().trim().max(100).optional(),
  view: z.string().max(100).optional(),
  total: bool.optional(),
});
export const setupIdsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(SETUP_LIST.bulkMax) });
export const setupSettingsBodySchema = z.object({ version: z.number().int().min(0), values: z.record(z.string(), z.unknown()) });
