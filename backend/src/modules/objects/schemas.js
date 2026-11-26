import { z } from 'zod';
import { FIELD_TYPES, FIELD_TYPE_IDS } from './engine/fieldTypes.js';
import { rulesSchema } from './engine/rules.js';
import { validationsSchema } from './engine/validation.js';
import { autofillsSchema } from './engine/autofill.js';
import { boundedCondition } from './engine/conditions.js';

const COLOURS = ['gray', 'brand', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'teal', 'indigo'];
const label = z.string().trim().min(1, 'Enter a label').max(80);
export const OBJECT_KEY = /^[A-Za-z][A-Za-z0-9_]{1,39}$/;

export const objectBodySchema = z.object({
  key: z.string().regex(OBJECT_KEY, 'Use letters, numbers and underscores, starting with a letter'),
  label, pluralLabel: label,
  description: z.string().trim().max(500).default(''),
  icon: z.string().trim().min(1).max(40).default('layers'),
  color: z.enum(COLOURS).default('brand'),
  workspaceScope: z.enum(['workspace', 'tenant']).default('workspace'),
  hasOwner: z.boolean().default(true), allowReports: z.boolean().default(true), allowActivities: z.boolean().default(false),
  allowAttachments: z.boolean().default(true), trackHistory: z.boolean().default(false), allowSearch: z.boolean().default(true),
  recordName: z.discriminatedUnion('kind', [z.object({ kind: z.literal('field'), fieldKey: z.string().max(41).optional() }).strict(), z.object({ kind: z.literal('auto'), format: z.string().max(60).default('R-{0000}'), start: z.number().int().min(0).default(1) }).strict()]).default({ kind: 'field' }),
  recordRules: z.array(z.object({ id: z.string().trim().min(1).max(40), message: z.string().trim().min(1).max(200), condition: boundedCondition, field: z.string().max(41).optional(), active: z.boolean().default(true) }).strict()).max(50).default([]),
  deploymentStatus: z.enum(['development', 'deployed']).default('deployed'),
}).strict();
export const objectPatchSchema = objectBodySchema.omit({ key: true }).partial().strict();

const fieldCommon = {
  label, type: z.enum(FIELD_TYPE_IDS),
  helpText: z.string().trim().max(300).default(''), description: z.string().trim().max(500).default(''),
  required: z.boolean().default(false), unique: z.boolean().default(false), indexed: z.boolean().default(false), encrypted: z.boolean().default(false), readOnly: z.boolean().default(false),
  defaultValue: z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(200)).max(200)]).nullable().optional(),
  section: z.string().trim().max(80).default(''), active: z.boolean().default(true),
  settings: z.record(z.any()).default({}), rules: rulesSchema.default([]), validations: validationsSchema.default([]), autofill: autofillsSchema.default([]),
};
export const fieldBodySchema = z.object({ key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/, 'Use letters, numbers and underscores, starting with a letter'), ...fieldCommon }).strict();
export const fieldPatchSchema = z.object(Object.fromEntries(Object.entries(fieldCommon).filter(([k]) => k !== 'type').map(([k, v]) => [k, v.optional?.() ?? v]))).partial().strict();
export const orderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).strict();

export const objectListQuery = z.object({
  q: z.string().trim().max(80).default(''), kind: z.enum(['all', 'standard', 'custom']).default('all'), archived: z.enum(['true', 'false']).default('false'),
  sort: z.enum(['label', 'key', 'fields', 'updated']).default('label'), order: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).default(0),
}).strict();
export const fieldListQuery = z.object({
  q: z.string().trim().max(80).default(''), type: z.string().max(40).optional(), group: z.string().max(40).optional(), flag: z.enum(['required', 'unique', 'encrypted', 'indexed', 'computed']).optional(),
  sort: z.enum(['order', 'label', 'key', 'type', 'updated']).default('order'), order: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(500).default(200), offset: z.coerce.number().int().min(0).default(0),
}).strict();
export const optionsQuery = z.object({ q: z.string().trim().max(80).default(''), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();

export const evaluateBodySchema = z.object({
  values: z.record(z.any()).default({}),
  original: z.record(z.any()).optional(),
  lines: z.array(z.record(z.any())).max(1000).optional(),
  parent: z.record(z.any()).optional(),
  related: z.record(z.record(z.any())).optional(),
  context: z.object({ mode: z.enum(['create', 'edit']).default('create'), device: z.enum(['desktop', 'mobile']).default('desktop'), recordType: z.string().max(80).optional(), isOwner: z.boolean().optional() }).strict().default({}),
  as: z.object({ role: z.string().max(40).optional(), profile: z.string().max(120).optional(), permissionSets: z.array(z.string().max(120)).max(50).optional() }).strict().optional(),
}).strict();

export { FIELD_TYPES };
