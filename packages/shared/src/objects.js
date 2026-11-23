import { z } from 'zod';

/** Field key from its label: "Lead Source" → "lead_source" (same rule as the registry generator). */
export const fieldKey = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Object Manager data types → how the field is edited and validated. */
const TYPES = {
  Text: { input: 'text' }, 'Text Area': { input: 'textarea' }, Email: { input: 'text', format: 'email' }, Phone: { input: 'text' }, URL: { input: 'text' },
  Number: { input: 'number' }, Currency: { input: 'number' }, Percent: { input: 'number' }, Date: { input: 'date' }, 'Date/Time': { input: 'text' },
  Checkbox: { input: 'check' }, Picklist: { input: 'text' }, Lookup: { input: 'text' }, Formula: { input: 'text', readOnly: true },
};
export const OBJECT_DATA_TYPES = Object.freeze(Object.keys(TYPES));
const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Object Manager field record → { key, label, type, input, required, readOnly }. */
export const toObjectField = (record) => {
  const label = record.field_label ?? record.label;
  const type = record.data_type ?? 'Text';
  const t = TYPES[type] ?? TYPES.Text;
  return { key: fieldKey(label), label, type, input: t.input, format: t.format, required: record.required === true, readOnly: Boolean(t.readOnly) };
};

const fieldSchema = (f) => {
  if (f.input === 'check') return z.boolean();
  if (f.input === 'number') return z.union([z.number(), z.string().regex(NUMERIC, 'Enter a number')]);
  if (f.input === 'date') return z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD');
  if (f.format === 'email') return z.union([z.literal(''), z.string().email('Enter a valid email')]);
  return z.string().max(f.input === 'textarea' ? 32_000 : 500);
};

/** Validation for a record of an object. Create requires the `required` fields; update is any subset. Same schema in UI and API. */
export const objectRecordSchema = (fields, mode) => {
  const editable = fields.filter((f) => !f.readOnly);
  const shape = Object.fromEntries(editable.map((f) => {
    const s = fieldSchema(f);
    return [f.key, mode === 'create' && f.required ? (f.input === 'check' ? s : s.refine((v) => v !== '', 'Required')) : s.optional()];
  }));
  const base = z.object(shape).strict();
  return mode === 'update' ? base.refine((v) => Object.keys(v).length > 0, 'Nothing to update') : base;
};

/** Objects shown as top-level navigation (the rest stay reachable from Object Manager and ⌘K). */
export const CRM_NAV_OBJECTS = Object.freeze([
  { key: 'Lead', plural: 'Leads', icon: 'target' }, { key: 'Account', plural: 'Accounts', icon: 'building' }, { key: 'Contact', plural: 'Contacts', icon: 'users' },
  { key: 'Opportunity', plural: 'Opportunities', icon: 'trend-up' }, { key: 'Case', plural: 'Cases', icon: 'life-buoy' }, { key: 'Campaign', plural: 'Campaigns', icon: 'megaphone' }, { key: 'Task', plural: 'Tasks', icon: 'check-square' },
]);

export const APPROVAL_STATUS = Object.freeze({ PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' });
export const approvalDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(500).optional() });

/** Dialog schema: blank number/date inputs mean "not set" rather than invalid. */
export const objectRecordFormSchema = (fields, mode) => {
  const blankable = fields.filter((f) => f.input === 'number' || f.input === 'date').map((f) => f.key);
  const strip = (value) => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k, v]) => !(blankable.includes(k) && v === ''))) : value);
  return z.preprocess(strip, objectRecordSchema(fields, mode));
};
