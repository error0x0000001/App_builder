import net from 'node:net';
import { z } from 'zod';
import { FIELD_TYPES } from './fieldTypes.js';
import { boundedCondition, compareDecimal, evaluateCondition } from './conditions.js';
import { evaluateExpression } from './expression.js';

/** Per-field validations an admin can add on top of the type's built-in checks. A validation fails (shows `message`) when it matches. */
export const VALIDATION_KINDS = [
  { id: 'pattern', label: 'Must match a pattern' }, { id: 'range', label: 'Value range' }, { id: 'length', label: 'Text length' }, { id: 'count', label: 'Number of items' },
  { id: 'date_range', label: 'Date range' }, { id: 'allowed_values', label: 'Allowed values' }, { id: 'condition', label: 'Fails when a condition is true' }, { id: 'expression', label: 'Fails when a formula is true' },
];
const base = { id: z.string().trim().min(1).max(40), message: z.string().trim().min(1).max(200), active: z.boolean().default(true), when: boundedCondition.nullable().default(null) };
export const validationSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('pattern'), pattern: z.string().min(1).max(300), flags: z.enum(['', 'i']).default('') }).strict(),
  z.object({ ...base, kind: z.literal('range'), min: z.string().max(40).optional(), max: z.string().max(40).optional() }).strict(),
  z.object({ ...base, kind: z.literal('length'), min: z.number().int().min(0).optional(), max: z.number().int().min(0).optional() }).strict(),
  z.object({ ...base, kind: z.literal('count'), min: z.number().int().min(0).optional(), max: z.number().int().min(0).optional() }).strict(),
  z.object({ ...base, kind: z.literal('date_range'), min: z.string().max(40).optional(), max: z.string().max(40).optional() }).strict(),
  z.object({ ...base, kind: z.literal('allowed_values'), values: z.array(z.string().max(200)).min(1).max(500) }).strict(),
  z.object({ ...base, kind: z.literal('condition'), condition: boundedCondition }).strict(),
  z.object({ ...base, kind: z.literal('expression'), expression: z.string().min(1).max(2000) }).strict(),
]).superRefine((v, ctx) => {
  if (v.kind === 'pattern') { try { new RegExp(v.pattern, v.flags); } catch { ctx.addIssue({ code: 'custom', path: ['pattern'], message: 'This is not a valid pattern' }); } if (/(\([^)]*[+*][^)]*\))[+*]/.test(v.pattern)) ctx.addIssue({ code: 'custom', path: ['pattern'], message: 'This pattern could be slow; simplify it' }); }
});
export const validationsSchema = z.array(validationSchema).max(50).refine((r) => new Set(r.map((x) => x.id)).size === r.length, 'Validation ids must be unique');

const blank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const err = (code, message) => ({ code, message });
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const dateLimit = (limit, ctx) => (limit === 'today' ? (ctx.now ?? new Date()).toISOString().slice(0, 10) : limit);
const outside = (v, min, max) => (min !== undefined && compareDecimal(v, min) < 0 ? 'below' : max !== undefined && compareDecimal(v, max) > 0 ? 'above' : null);

/** Built-in checks for each type. Returns a list of { code, message }. */
function builtIn(field, value, ctx) {
  const s = field.settings ?? {}; const out = [];
  const text = typeof value === 'string' ? value : null;
  switch (field.type) {
    case 'text': case 'long_text': case 'rich_text': case 'html': case 'email': case 'phone': case 'url': case 'barcode': {
      if (text === null) return [err('type', 'Enter text')];
      if (s.minLength !== undefined && text.length < s.minLength) out.push(err('min_length', `Use at least ${s.minLength} characters`));
      if (s.maxLength !== undefined && text.length > s.maxLength) out.push(err('max_length', `Use at most ${s.maxLength} characters`));
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) out.push(err('format', 'Enter a valid email address'));
      if (field.type === 'phone') { const digits = text.replace(/\D/g, ''); if (!/^[+()\-.\s\d]+$/.test(text) || digits.length < 5 || digits.length > 15) out.push(err('format', 'Enter a valid phone number')); }
      if (field.type === 'url') { try { const u = new URL(text); if (!(s.schemes ?? ['http', 'https']).includes(u.protocol.replace(':', ''))) out.push(err('format', `Use a link starting with ${(s.schemes ?? ['http', 'https']).join(' or ')}`)); } catch { out.push(err('format', 'Enter a valid link')); } }
      break;
    }
    case 'number': if (!/^-?\d+$/.test(String(value))) return [err('type', 'Enter a whole number')]; // falls through to the range check
    case 'decimal': case 'currency': case 'percent': {
      if (!DECIMAL.test(String(value))) return [err('type', 'Enter a number')];
      const side = outside(String(value), s.min, s.max);
      if (side === 'below') out.push(err('min', `Must be at least ${s.min}`)); if (side === 'above') out.push(err('max', `Must be at most ${s.max}`));
      break;
    }
    case 'rating': { const scale = Number(s.scale ?? 5); if (!Number.isInteger(value) || value < 0 || value > scale) out.push(err('range', `Choose 0 to ${scale}`)); break; }
    case 'slider': { if (!DECIMAL.test(String(value))) return [err('type', 'Enter a number')]; const side = outside(String(value), s.min, s.max); if (side) out.push(err(side === 'below' ? 'min' : 'max', `Choose between ${s.min ?? '…'} and ${s.max ?? '…'}`)); break; }
    case 'date': { if (text === null || !isoDate(text)) return [err('type', 'Enter a valid date')]; const lo = dateLimit(s.min, ctx); const hi = dateLimit(s.max, ctx); if (lo && text < lo) out.push(err('min', `Choose ${lo} or later`)); if (hi && text > hi) out.push(err('max', `Choose ${hi} or earlier`)); break; }
    case 'date_time': { if (text === null || Number.isNaN(Date.parse(text))) return [err('type', 'Enter a valid date and time')]; if (s.min && Date.parse(text) < Date.parse(dateLimit(s.min, ctx))) out.push(err('min', 'Too early')); if (s.max && Date.parse(text) > Date.parse(dateLimit(s.max, ctx))) out.push(err('max', 'Too late')); break; }
    case 'time': if (text === null || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(text)) out.push(err('type', 'Enter a time like 14:30')); break;
    case 'duration': if (!Number.isInteger(value) || value < 0 || (s.max !== undefined && value > s.max)) out.push(err('range', s.max !== undefined ? `Enter 0 to ${s.max} ${s.unit ?? 'hours'}` : 'Enter a length of time')); break;
    case 'checkbox': if (typeof value !== 'boolean') out.push(err('type', 'Choose on or off')); break;
    case 'picklist': case 'status_path': {
      const allowed = field.type === 'status_path' ? (s.stages ?? []).map((x) => x.value) : (s.values ?? []).filter((x) => x.active !== false).map((x) => x.value);
      if (typeof value !== 'string' || ((s.restrict ?? true) && !allowed.includes(value))) out.push(err('option', 'Choose one of the available values'));
      break;
    }
    case 'multi_picklist': { const allowed = (s.values ?? []).filter((x) => x.active !== false).map((x) => x.value); if (!Array.isArray(value) || (s.restrict ?? true) && value.some((v) => !allowed.includes(v))) out.push(err('option', 'Choose from the available values')); break; }
    case 'tags': { if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) return [err('type', 'Enter tags')]; if (s.max && value.length > s.max) out.push(err('max', `Use at most ${s.max} tags`)); if (!(s.freeEntry ?? true) && value.some((v) => !(s.allowed ?? []).includes(v))) out.push(err('option', 'Use the existing tags')); break; }
    case 'checklist': if (!Array.isArray(value) || value.some((i) => typeof i?.text !== 'string' || typeof i?.done !== 'boolean')) out.push(err('type', 'Enter checklist items')); else if (s.max && value.length > s.max) out.push(err('max', `Use at most ${s.max} items`)); break;
    case 'lookup': case 'master_detail': case 'user': if (typeof value !== 'string' || !UUID.test(value)) out.push(err('type', 'Choose a record')); break;
    case 'many_to_many': if (!Array.isArray(value) || value.some((v) => !UUID.test(v))) out.push(err('type', 'Choose records')); break;
    case 'polymorphic': if (!value || !(s.targets ?? []).includes(value.object) || !UUID.test(value.id ?? '')) out.push(err('type', 'Choose a record')); break;
    case 'line_items': {
      if (!Array.isArray(value)) return [err('type', 'Enter line items')];
      if (s.minRows !== undefined && value.length < s.minRows) out.push(err('min_rows', `Add at least ${s.minRows} lines`));
      if (s.maxRows !== undefined && value.length > s.maxRows) out.push(err('max_rows', `Add at most ${s.maxRows} lines`));
      break;
    }
    case 'address': if (typeof value !== 'object' || value === null || (s.requireCountry && !value.country)) out.push(err('type', s.requireCountry ? 'Enter an address with a country' : 'Enter an address')); break;
    case 'location': if (typeof value?.lat !== 'number' || typeof value?.lng !== 'number' || Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) out.push(err('type', 'Enter a valid location')); break;
    case 'file': case 'photo': case 'signature': {
      const files = Array.isArray(value) ? value : [value];
      if (files.some((f) => !f || typeof f.name !== 'string')) return [err('type', 'Attach a file')];
      if (field.type === 'file') {
        if (!(s.multiple ?? false) && files.length > 1) out.push(err('max', 'Attach one file only'));
        if (s.maxFiles !== undefined && files.length > s.maxFiles) out.push(err('max', `Attach at most ${s.maxFiles} files`));
        if (s.minFiles !== undefined && files.length < s.minFiles) out.push(err('min', `Attach at least ${s.minFiles} files`));
        if (s.allowedTypes?.length) { const ok = (f) => s.allowedTypes.some((t) => (t.includes('/') ? f.mime === t || (t.endsWith('/*') && f.mime?.startsWith(t.slice(0, -1))) : f.name.toLowerCase().endsWith(`.${t.replace(/^\./, '').toLowerCase()}`))); if (!files.every(ok)) out.push(err('type', `Allowed types: ${s.allowedTypes.join(', ')}`)); }
        if (s.totalSize && files.reduce((n, f) => n + (f.size ?? 0), 0) > s.totalSize) out.push(err('size', 'The files are too large together'));
      }
      if (s.maxSize && files.some((f) => (f.size ?? 0) > s.maxSize)) out.push(err('size', 'A file is too large'));
      break;
    }
    case 'colour': if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) out.push(err('format', 'Enter a colour like #7f56d9')); break;
    case 'ip_address': { const v = net.isIP(String(value)); if (!v || (s.version === 'v4' && v !== 4) || (s.version === 'v6' && v !== 6)) out.push(err('format', 'Enter a valid IP address')); break; }
    case 'password': if (typeof value !== 'string' || !value) out.push(err('type', 'Enter a value')); break;
    default: break;
  }
  return out;
}

/** Admin-defined validations. */
function custom(field, value, ctx) {
  const out = [];
  for (const v of field.validations ?? []) {
    if (v.active === false || !evaluateCondition(v.when, ctx)) continue;
    let failed = false;
    if (v.kind === 'pattern') { try { failed = !new RegExp(v.pattern, v.flags).test(String(value)); } catch { failed = false; } }
    else if (v.kind === 'range') { if (DECIMAL.test(String(value))) failed = outside(String(value), v.min, v.max) !== null; }
    else if (v.kind === 'length') { const n = String(value).length; failed = (v.min !== undefined && n < v.min) || (v.max !== undefined && n > v.max); }
    else if (v.kind === 'count') { const n = Array.isArray(value) ? value.length : 0; failed = (v.min !== undefined && n < v.min) || (v.max !== undefined && n > v.max); }
    else if (v.kind === 'date_range') { const lo = dateLimit(v.min, ctx); const hi = dateLimit(v.max, ctx); failed = (lo && String(value) < lo) || (hi && String(value) > hi); }
    else if (v.kind === 'allowed_values') failed = ![].concat(value).every((x) => v.values.includes(String(x)));
    else if (v.kind === 'condition') failed = evaluateCondition(v.condition, ctx);
    else if (v.kind === 'expression') { const r = evaluateExpression(v.expression, ctx); failed = Boolean(r.value) && !r.error; }
    if (failed) out.push(err(`custom:${v.id}`, v.message));
  }
  return out;
}

/** All problems with one field's value. `state` is the result of computeFieldState. Computed types are never validated (they're not entered). */
export function validateFieldValue(field, value, ctx, state) {
  if (FIELD_TYPES[field.type]?.computed || state.visible === false) return [];
  if (blank(value)) return state.required ? [err('required', 'This field is required')] : [];
  if (state.readOnly && ctx.original && JSON.stringify(ctx.original[field.key]) !== JSON.stringify(value) && ctx.context?.mode === 'edit') return [err('read_only', 'This field is locked')];
  if (state.options && ![].concat(value).every((x) => state.options.includes(String(x)))) return [err('option', 'This value isn’t available right now')];
  return [...builtIn(field, value, ctx), ...custom(field, value, ctx)];
}

/** Record-level validation rules (an object can have rules that look at several fields). */
export function validateRecordRules(rules, ctx) {
  return (rules ?? []).filter((r) => r.active !== false && evaluateCondition(r.condition, ctx)).map((r) => ({ field: r.field ?? null, code: `rule:${r.id}`, message: r.message }));
}
