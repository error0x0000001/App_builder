import { z } from 'zod';
import { boundedCondition } from './conditions.js';
import { parseExpression } from './expression.js';

/**
 * THE registry of field types. The API validates with it, the engine evaluates with it and the UI is generated from it
 * (served by GET /objects/meta) — nothing about a type is written down anywhere else.
 *
 * A setting descriptor: { key, label, kind, default?, help?, … }. Kinds:
 *   string · text · int · decimal · bool · enum(options) · strings · color · expression · condition
 *   objectKey · fieldKey · fieldKeys (checked against the tenant's definitions by the service)
 *   options (picklist values) · stages (status path) · columns (line-item grid) · rollups (parent totals)
 */
const d = {
  string: (key, label, o = {}) => ({ key, label, kind: 'string', ...o }),
  text: (key, label, o = {}) => ({ key, label, kind: 'text', ...o }),
  int: (key, label, o = {}) => ({ key, label, kind: 'int', ...o }),
  decimal: (key, label, o = {}) => ({ key, label, kind: 'decimal', ...o }),
  bool: (key, label, def = false, o = {}) => ({ key, label, kind: 'bool', default: def, ...o }),
  enum: (key, label, options, def, o = {}) => ({ key, label, kind: 'enum', options: options.map((v) => (typeof v === 'string' ? { value: v, label: v } : v)), default: def ?? (typeof options[0] === 'string' ? options[0] : options[0].value), ...o }),
  strings: (key, label, o = {}) => ({ key, label, kind: 'strings', default: [], ...o }),
  condition: (key, label, o = {}) => ({ key, label, kind: 'condition', ...o }),
  object: (key, label, o = {}) => ({ key, label, kind: 'objectKey', ...o }),
  field: (key, label, o = {}) => ({ key, label, kind: 'fieldKey', ...o }),
  fields: (key, label, o = {}) => ({ key, label, kind: 'fieldKeys', default: [], ...o }),
};

const MIN_MAX = [d.decimal('min', 'Minimum value'), d.decimal('max', 'Maximum value')];
const LENGTHS = (cap) => [d.int('minLength', 'Minimum length', { min: 0, max: cap }), d.int('maxLength', 'Maximum length', { min: 1, max: cap, default: cap })];
const RELATION = [
  d.string('relationshipName', 'Relationship name', { max: 60 }), d.string('relatedListLabel', 'Related list label', { max: 80 }),
  d.string('displayTemplate', 'Display template', { max: 200, help: 'For example {name} — {city}' }),
  d.fields('searchFields', 'Search fields'), d.fields('columns', 'Dropdown columns'),
  d.condition('filter', 'Lookup filter', { help: 'Only records matching this can be picked. Use target.<field> via this/parent references.' }),
  d.enum('filterMode', 'Filter is', ['required', 'optional'], 'required'),
  d.enum('onMismatch', 'When the chosen record stops matching', ['clear', 'warn', 'block'], 'warn'),
  d.bool('allowCreateInline', 'Allow creating a record from the picker', false),
];

const TYPE_LIST = [
  // ---- text
  { id: 'text', label: 'Text', group: 'Text', icon: 'type', stored: 'text', encryptable: true, unique: true, settings: [...LENGTHS(255), d.bool('caseSensitive', 'Case-sensitive unique', false)] },
  { id: 'long_text', label: 'Long text', group: 'Text', icon: 'align-left', stored: 'text', encryptable: true, settings: [...LENGTHS(131072), d.int('rows', 'Visible lines', { min: 2, max: 40, default: 4 })] },
  { id: 'rich_text', label: 'Rich text', group: 'Text', icon: 'edit', stored: 'text (sanitised HTML)', encryptable: true, settings: [d.int('maxLength', 'Maximum length', { min: 1, max: 131072, default: 32768 }), d.strings('formats', 'Allowed formatting', { default: ['bold', 'italic', 'underline', 'list', 'link'] }), d.bool('allowImages', 'Allow images', false), d.bool('mentions', 'Allow mentions', false)] },
  { id: 'html', label: 'HTML', group: 'Text', icon: 'code', stored: 'text', encryptable: true, settings: [d.enum('mode', 'Mode', [{ value: 'display', label: 'Display only' }, { value: 'source', label: 'Source editor' }], 'display'), d.strings('allowedTags', 'Allowed tags', { default: ['p', 'a', 'b', 'i', 'ul', 'ol', 'li', 'br', 'strong', 'em', 'table', 'tr', 'td', 'th'] }), d.int('maxLength', 'Maximum length', { min: 1, max: 131072, default: 32768 })] },
  { id: 'email', label: 'Email', group: 'Text', icon: 'mail', stored: 'text', encryptable: true, unique: true, settings: [] },
  { id: 'phone', label: 'Phone', group: 'Text', icon: 'phone', stored: 'text', encryptable: true, settings: [d.string('format', 'Format hint', { max: 40 })] },
  { id: 'url', label: 'URL', group: 'Text', icon: 'link', stored: 'text', encryptable: true, settings: [d.strings('schemes', 'Allowed schemes', { default: ['http', 'https'] })] },
  // ---- numbers
  { id: 'number', label: 'Number', group: 'Numbers', icon: 'hash', stored: 'bigint', encryptable: true, unique: true, settings: MIN_MAX },
  { id: 'decimal', label: 'Decimal', group: 'Numbers', icon: 'hash', stored: 'numeric', encryptable: true, unique: true, settings: MIN_MAX },
  { id: 'currency', label: 'Currency', group: 'Numbers', icon: 'currency', stored: 'numeric + currency code', encryptable: true, settings: [...MIN_MAX, d.string('currencyCode', 'Currency code', { max: 3, default: 'USD' }), d.field('currencyField', 'Currency code field')] },
  { id: 'percent', label: 'Percent', group: 'Numbers', icon: 'percent', stored: 'numeric', encryptable: true, settings: MIN_MAX },
  { id: 'rating', label: 'Rating', group: 'Numbers', icon: 'star', stored: 'smallint', settings: [d.enum('scale', 'Scale', [{ value: '5', label: '5 stars' }, { value: '10', label: '10 stars' }], '5'), d.enum('icon', 'Icon', ['star', 'heart', 'thumb'], 'star')] },
  { id: 'slider', label: 'Slider', group: 'Numbers', icon: 'sliders', stored: 'numeric', settings: [d.decimal('min', 'Minimum', { default: '0' }), d.decimal('max', 'Maximum', { default: '100' }), d.decimal('step', 'Step', { default: '1' }), d.string('unit', 'Unit', { max: 20 })] },
  // ---- date and time
  { id: 'date', label: 'Date', group: 'Date & time', icon: 'calendar', stored: 'date', encryptable: true, settings: [d.string('min', 'Earliest date', { max: 20, help: 'YYYY-MM-DD or "today"' }), d.string('max', 'Latest date', { max: 20 })] },
  { id: 'date_time', label: 'Date and time', group: 'Date & time', icon: 'clock', stored: 'timestamptz', encryptable: true, settings: [d.string('min', 'Earliest', { max: 30 }), d.string('max', 'Latest', { max: 30 })] },
  { id: 'time', label: 'Time', group: 'Date & time', icon: 'clock', stored: 'time', settings: [] },
  { id: 'duration', label: 'Duration', group: 'Date & time', icon: 'clock', stored: 'interval', settings: [d.enum('unit', 'Unit', ['minutes', 'hours', 'days'], 'hours'), d.int('max', 'Maximum', { min: 1 })] },
  { id: 'timer', label: 'Timer', group: 'Date & time', icon: 'clock', stored: 'time entries', settings: [d.bool('oneRunning', 'One running timer per person', true), d.bool('allowManual', 'Allow manual entries', true), d.bool('billable', 'Entries can be billable', false), d.enum('rounding', 'Round entries to', [{ value: 'none', label: 'No rounding' }, { value: '5', label: '5 minutes' }, { value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }], 'none')] },
  // ---- choice
  { id: 'checkbox', label: 'Checkbox', group: 'Choice', icon: 'check', stored: 'boolean', settings: [] },
  { id: 'picklist', label: 'Picklist', group: 'Choice', icon: 'list', stored: 'text', encryptable: false, settings: [{ key: 'values', label: 'Values', kind: 'options', default: [] }, d.bool('restrict', 'Restrict to these values', true), d.field('controllingField', 'Controlling field')] },
  { id: 'multi_picklist', label: 'Multi-select picklist', group: 'Choice', icon: 'list', stored: 'text[]', settings: [{ key: 'values', label: 'Values', kind: 'options', default: [] }, d.bool('restrict', 'Restrict to these values', true), d.int('visibleLines', 'Visible lines', { min: 2, max: 12, default: 4 })] },
  { id: 'status_path', label: 'Status path', group: 'Choice', icon: 'flag', stored: 'text', settings: [{ key: 'stages', label: 'Stages', kind: 'stages', default: [] }] },
  { id: 'tags', label: 'Tags', group: 'Choice', icon: 'tag', stored: 'tags table', settings: [d.strings('allowed', 'Allowed tags'), d.bool('freeEntry', 'Allow new tags', true), d.int('max', 'Maximum tags', { min: 1, max: 100, default: 20 })] },
  { id: 'checklist', label: 'Checklist', group: 'Choice', icon: 'check-square', stored: 'checklist rows', settings: [d.bool('allowReorder', 'Allow reordering', true), d.bool('showProgress', 'Show completion', true), d.int('max', 'Maximum items', { min: 1, max: 200, default: 50 })] },
  // ---- relationships
  { id: 'lookup', label: 'Lookup', group: 'Relationships', icon: 'link', stored: 'uuid foreign key', settings: [d.object('target', 'Related object', { required: true }), d.enum('onDelete', 'When the related record is deleted', [{ value: 'clear', label: 'Clear this field' }, { value: 'block', label: 'Block the delete' }], 'clear'), ...RELATION] },
  { id: 'master_detail', label: 'Master-detail', group: 'Relationships', icon: 'git-merge', stored: 'uuid foreign key (required)', forceRequired: true, settings: [d.object('target', 'Parent object', { required: true }), d.bool('allowReparent', 'Allow changing the parent', false), ...RELATION] },
  { id: 'many_to_many', label: 'Many-to-many', group: 'Relationships', icon: 'share', stored: 'link table', settings: [d.object('target', 'Related object', { required: true }), d.string('relationshipName', 'Relationship name', { max: 60 }), d.string('relatedListLabel', 'Related list label', { max: 80 }), d.condition('filter', 'Filter')] },
  { id: 'polymorphic', label: 'Polymorphic lookup', group: 'Relationships', icon: 'shuffle', stored: 'object + id columns', settings: [d.strings('targets', 'Allowed objects', { required: true })] },
  { id: 'user', label: 'User', group: 'Relationships', icon: 'user', stored: 'uuid foreign key (person)', settings: [
    d.strings('profiles', 'Only these profiles'), d.strings('hierarchyRoles', 'Only these roles in the hierarchy'), d.bool('includeSubtree', 'Include roles below them', true),
    d.strings('permissionSets', 'Only people with these permission sets'), d.strings('orgRoles', 'Only these organisation roles'),
    d.enum('workspace', 'Workspace', [{ value: 'current', label: 'Current workspace only' }, { value: 'any', label: 'Any workspace' }], 'current'), d.bool('activeOnly', 'Active people only', true),
    d.condition('filter', 'Extra filter')] },
  // ---- computed
  { id: 'formula', label: 'Formula', group: 'Computed', icon: 'function', stored: 'computed', computed: true, settings: [{ key: 'expression', label: 'Expression', kind: 'expression', required: true }, d.enum('returnType', 'Returns', ['text', 'number', 'currency', 'date', 'checkbox'], 'number'), d.enum('blank', 'Blank values count as', [{ value: 'zero', label: 'Zero' }, { value: 'blank', label: 'Blank' }], 'zero')] },
  { id: 'rollup', label: 'Roll-up summary', group: 'Computed', icon: 'sigma', stored: 'computed', computed: true, settings: [d.object('child', 'Child object', { required: true }), d.field('childField', 'Child field'), d.enum('fn', 'Summary', ['count', 'sum', 'min', 'max'], 'count'), d.condition('filter', 'Only rows matching')] },
  { id: 'auto_number', label: 'Auto-number', group: 'Computed', icon: 'hash', stored: 'bigint counter', computed: true, settings: [
    d.string('format', 'Display format', { max: 60, default: 'N-{0000}', help: '{0000} is the counter (zeros = minimum digits). Also {YYYY} {YY} {MM} {DD}.' }),
    d.int('start', 'Starting number', { min: 0, default: 1 }), d.int('increment', 'Step', { min: 1, max: 1000, default: 1 }),
    d.enum('cycle', 'Start again from the starting number', [{ value: 'never', label: 'Never' }, { value: 'yearly', label: 'Every year' }, { value: 'monthly', label: 'Every month' }, { value: 'daily', label: 'Every day' }], 'never'),
    d.enum('scope', 'Count', [{ value: 'workspace', label: 'Separately in each workspace' }, { value: 'tenant', label: 'Across the whole organisation' }], 'workspace')] },
  // ---- structured
  { id: 'line_items', label: 'Line items', group: 'Structured', icon: 'table', stored: 'child rows (master-detail)', settings: [d.object('lineObject', 'Line object', { required: true }), { key: 'columns', label: 'Grid columns', kind: 'columns', default: [] }, d.int('minRows', 'Minimum rows', { min: 0, max: 1000 }), d.int('maxRows', 'Maximum rows', { min: 1, max: 1000 }), d.bool('allowAdd', 'Allow adding rows', true), d.bool('allowDelete', 'Allow deleting rows', true), d.bool('allowReorder', 'Allow reordering rows', true), { key: 'rollups', label: 'Totals on the parent', kind: 'rollups', default: [] }] },
  { id: 'address', label: 'Address', group: 'Structured', icon: 'map-pin', stored: 'address columns', encryptable: true, settings: [d.bool('requireCountry', 'Country is required', false)] },
  { id: 'location', label: 'Location', group: 'Structured', icon: 'map-pin', stored: 'latitude + longitude', settings: [] },
  // ---- media
  { id: 'file', label: 'File upload', group: 'Media', icon: 'paperclip', stored: 'Documents files', settings: [d.enum('kind', 'Kind', ['file', 'image', 'document', 'media'], 'file'), d.bool('multiple', 'Allow several files', false), d.int('minFiles', 'Minimum files', { min: 0, max: 100 }), d.int('maxFiles', 'Maximum files', { min: 1, max: 100, default: 10 }), d.strings('allowedTypes', 'Allowed types', { help: 'Extensions or MIME types, e.g. pdf, image/png' }), d.int('maxSize', 'Largest file (bytes)', { min: 1 }), d.int('totalSize', 'Total size per field (bytes)', { min: 1 }), d.enum('naming', 'Naming', [{ value: 'original', label: 'Keep original name' }, { value: 'pattern', label: 'Use a pattern' }], 'original'), d.string('namePattern', 'Name pattern', { max: 120 }), d.enum('versioning', 'On replace', [{ value: 'keep', label: 'Keep old versions' }, { value: 'overwrite', label: 'Overwrite' }], 'keep'), d.bool('capture', 'Allow camera and scanner', false), d.enum('preview', 'Preview', ['inline', 'gallery', 'link'], 'inline'), d.enum('download', 'Download', [{ value: 'allow', label: 'Allowed' }, { value: 'view', label: 'View only' }], 'allow'), d.bool('virusScan', 'Scan for viruses', false), d.enum('onDelete', 'When the record is deleted', [{ value: 'trash', label: 'Move files to trash' }, { value: 'keep', label: 'Keep files' }], 'trash')] },
  { id: 'photo', label: 'Photo', group: 'Media', icon: 'image', stored: 'Documents file', settings: [d.enum('shape', 'Shape', ['round', 'square'], 'round'), d.int('maxSize', 'Largest file (bytes)', { min: 1, default: 5242880 })] },
  { id: 'signature', label: 'Signature', group: 'Media', icon: 'pen', stored: 'Documents file + signer', settings: [d.bool('requireSigner', 'Record who signed', true)] },
  // ---- other
  { id: 'colour', label: 'Colour', group: 'Other', icon: 'palette', stored: 'text (#rrggbb)', settings: [d.strings('presets', 'Preset colours')] },
  { id: 'barcode', label: 'Barcode / QR', group: 'Other', icon: 'qr-code', stored: 'text', encryptable: true, unique: true, settings: [d.enum('format', 'Format', [{ value: 'qr', label: 'QR code' }, { value: 'ean13', label: 'EAN-13' }, { value: 'code128', label: 'Code 128' }], 'qr'), d.bool('allowScan', 'Allow scanning with the camera', true)] },
  { id: 'ip_address', label: 'IP address', group: 'Other', icon: 'globe', stored: 'inet', encryptable: true, settings: [d.enum('version', 'Version', [{ value: 'any', label: 'IPv4 or IPv6' }, { value: 'v4', label: 'IPv4' }, { value: 'v6', label: 'IPv6' }], 'any')] },
  { id: 'password', label: 'Secret', group: 'Other', icon: 'lock', stored: 'encrypted bytes', alwaysEncrypted: true, encryptable: true, settings: [d.bool('mask', 'Mask the value', true), d.enum('reveal', 'Who may reveal it', [{ value: 'permission', label: 'People with reveal permission' }, { value: 'never', label: 'Nobody' }], 'permission')] },
];

export const FIELD_TYPES = Object.fromEntries(TYPE_LIST.map((t) => [t.id, { unique: false, encryptable: false, computed: false, ...t }]));
export const FIELD_TYPE_IDS = TYPE_LIST.map((t) => t.id);

/** What the UI needs to render the field-type picker and the settings forms (no zod, no functions). */
export const fieldTypeCatalog = () => TYPE_LIST.map(({ id, label, group, icon, stored, encryptable, unique, computed, forceRequired, alwaysEncrypted, settings }) => ({
  id, label, group, icon, stored, encryptable: Boolean(encryptable), unique: Boolean(unique), computed: Boolean(computed), forceRequired: Boolean(forceRequired), alwaysEncrypted: Boolean(alwaysEncrypted), settings,
}));

// ------------------------------------------------------------------------------------------------------------- settings validation

const KEY = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/, 'Use letters, numbers and underscores');
const COLOURS = ['gray', 'brand', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'teal', 'indigo'];
const decimalString = z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'Enter a number').or(z.literal('').transform(() => undefined));
const optionValues = z.array(z.object({ value: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(80), color: z.enum(COLOURS).optional(), isDefault: z.boolean().optional(), active: z.boolean().optional() }).strict()).max(500)
  .refine((v) => new Set(v.map((o) => o.value.toLowerCase())).size === v.length, 'Values must be unique');
const stages = z.array(z.object({ value: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(80), won: z.boolean().optional(), closed: z.boolean().optional(), guidance: z.string().max(500).optional(), requiredFields: z.array(KEY).max(30).optional() }).strict()).max(40)
  .refine((v) => new Set(v.map((o) => o.value.toLowerCase())).size === v.length, 'Stages must be unique');
const columns = z.array(z.object({ field: KEY, width: z.number().int().min(40).max(600).optional() }).strict()).max(30);
const rollups = z.array(z.object({ target: KEY, fn: z.enum(['count', 'sum', 'min', 'max']), field: KEY.optional() }).strict()).max(20);

function zodFor(desc) {
  let schema;
  switch (desc.kind) {
    case 'string': schema = z.string().trim().max(desc.max ?? 200); break;
    case 'text': schema = z.string().max(desc.max ?? 2000); break;
    case 'int': schema = z.number().int().min(desc.min ?? Number.MIN_SAFE_INTEGER).max(desc.max ?? Number.MAX_SAFE_INTEGER); break;
    case 'decimal': schema = decimalString; break;
    case 'bool': schema = z.boolean(); break;
    case 'enum': schema = z.enum(desc.options.map((o) => o.value)); break;
    case 'strings': schema = z.array(z.string().trim().min(1).max(120)).max(500); break;
    case 'objectKey': case 'fieldKey': schema = KEY; break;
    case 'fieldKeys': schema = z.array(KEY).max(30); break;
    case 'condition': schema = boundedCondition.nullable(); break;
    case 'options': schema = optionValues; break;
    case 'stages': schema = stages; break;
    case 'columns': schema = columns; break;
    case 'rollups': schema = rollups; break;
    case 'expression': schema = z.string().min(1).max(4000).superRefine((v, ctx) => { try { parseExpression(v); } catch (e) { ctx.addIssue({ code: 'custom', message: e.message }); } }); break;
    default: schema = z.any();
  }
  schema = schema.optional();
  return desc.default !== undefined ? schema.default(desc.default) : schema;
}

/** Validates + normalises a field's settings against its type; unknown keys are rejected. Returns { settings } or { issues }. */
export function parseSettings(typeId, raw) {
  const type = FIELD_TYPES[typeId];
  if (!type) return { issues: [{ path: 'type', message: 'Unknown field type' }] };
  const schema = z.object(Object.fromEntries(type.settings.map((s) => [s.key, zodFor(s)]))).strict();
  const result = schema.safeParse(raw ?? {});
  if (!result.success) return { issues: result.error.issues.map((i) => ({ path: ['settings', ...i.path].join('.'), message: i.message })) };
  const missing = type.settings.filter((s) => s.required && (result.data[s.key] === undefined || result.data[s.key] === '' || (Array.isArray(result.data[s.key]) && !result.data[s.key].length)));
  if (missing.length) return { issues: missing.map((s) => ({ path: `settings.${s.key}`, message: `${s.label} is required` })) };
  const out = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
  if (typeId === 'picklist' || typeId === 'multi_picklist') { const defaults = (out.values ?? []).filter((v) => v.isDefault); if (typeId === 'picklist' && defaults.length > 1) return { issues: [{ path: 'settings.values', message: 'Only one value can be the default' }] }; }
  const min = out.min; const max = out.max;
  if (min !== undefined && max !== undefined && /^-?\d/.test(min) && /^-?\d/.test(max) && Number(min) > Number(max)) return { issues: [{ path: 'settings.min', message: 'The minimum can’t be above the maximum' }] };
  if (out.minLength !== undefined && out.maxLength !== undefined && out.minLength > out.maxLength) return { issues: [{ path: 'settings.minLength', message: 'The minimum can’t be above the maximum' }] };
  return { settings: out };
}

/** Objects and fields a setting points at (so the service can check they exist and track dependencies). */
export function settingReferences(typeId, settings) {
  const type = FIELD_TYPES[typeId]; const refs = { objects: [], fields: [] };
  for (const s of type?.settings ?? []) {
    const v = settings?.[s.key]; if (v === undefined || v === null) continue;
    if (s.kind === 'objectKey') refs.objects.push(v);
    if (s.kind === 'fieldKey') refs.fields.push(v);
    if (s.kind === 'fieldKeys') refs.fields.push(...v);
  }
  if (typeId === 'polymorphic') refs.objects.push(...(settings?.targets ?? []));
  return refs;
}
