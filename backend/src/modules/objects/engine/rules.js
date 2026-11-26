import { z } from 'zod';
import { FIELD_TYPES } from './fieldTypes.js';
import { boundedCondition, compareDecimal, evaluateCondition } from './conditions.js';

/** Conditional behaviour of a field: visible / required / read-only / default / allowed options. Evaluated on the server only. */
export const RULE_EFFECTS = [
  { id: 'show', label: 'Show only when', help: 'Hidden whenever the condition is false' },
  { id: 'hide', label: 'Hide when', help: 'Hidden whenever the condition is true' },
  { id: 'require', label: 'Require when', help: 'A value is required whenever the condition is true' },
  { id: 'lock', label: 'Make read-only when', help: 'Locked whenever the condition is true' },
  { id: 'set_default', label: 'Default to … when', help: 'Provides this value when the condition is true' },
  { id: 'restrict_options', label: 'Limit options when', help: 'Only these options may be chosen when the condition is true' },
  { id: 'clear_when_hidden', label: 'Clear when hidden', help: 'Empty the value while the field is hidden' },
];
const EFFECT_IDS = RULE_EFFECTS.map((e) => e.id);
const list = z.array(z.string().trim().min(1).max(120)).max(100).default([]);

export const ruleSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().max(120).optional(),
  effect: z.enum(EFFECT_IDS),
  condition: boundedCondition.nullable().default(null),
  on: z.enum(['create', 'edit', 'both']).default('both'),
  appliesTo: z.object({ roles: list, profiles: list, permissionSets: list, workspaces: list }).strict().default({}),
  active: z.boolean().default(true),
  message: z.string().trim().max(200).optional(),
  value: z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(200)).max(200)]).nullable().optional(),
  options: z.array(z.string().max(200)).max(500).optional(),
  order: z.number().int().min(0).max(1000).default(0),
}).strict().superRefine((rule, ctx) => {
  if (rule.effect === 'restrict_options' && !rule.options?.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Choose the options that stay available' });
  if (rule.effect === 'set_default' && rule.value === undefined) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter the default value' });
});
export const rulesSchema = z.array(ruleSchema).max(50).refine((r) => new Set(r.map((x) => x.id)).size === r.length, 'Rule ids must be unique');

const modeMatches = (rule, ctx) => rule.on === 'both' || rule.on === (ctx.context?.mode ?? 'edit');
function appliesToPerson(rule, ctx) {
  const a = rule.appliesTo ?? {}; const u = ctx.user ?? {};
  const has = (values, mine) => !values?.length || [].concat(mine ?? []).some((m) => values.includes(m)); // every listed dimension must match
  return has(a.roles, u.role) && has(a.profiles, u.profile) && has(a.permissionSets, u.permissionSets) && has(a.workspaces, u.workspaceId);
}

/** The resolved state of one field for this person, mode and record values. */
export function computeFieldState(field, ctx) {
  const type = FIELD_TYPES[field.type];
  const state = { visible: true, required: Boolean(field.required) || Boolean(type?.forceRequired), readOnly: Boolean(field.readOnly) || Boolean(type?.computed), default: undefined, options: null, clearWhenHidden: false, messages: [] };
  const rules = [...(field.rules ?? [])].filter((r) => r.active !== false && modeMatches(r, ctx) && appliesToPerson(r, ctx)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const rule of rules) {
    const hit = evaluateCondition(rule.condition, ctx);
    switch (rule.effect) {
      case 'show': if (!hit) { state.visible = false; if (rule.message) state.messages.push(rule.message); } break;
      case 'hide': if (hit) { state.visible = false; if (rule.message) state.messages.push(rule.message); } break;
      case 'require': if (hit) { state.required = true; } break;
      case 'lock': if (hit) { state.readOnly = true; if (rule.message) state.messages.push(rule.message); } break;
      case 'set_default': if (hit) state.default = rule.value; break;
      case 'restrict_options': if (hit) state.options = state.options ? state.options.filter((o) => rule.options.includes(o)) : [...rule.options]; break;
      case 'clear_when_hidden': state.clearWhenHidden = true; break;
      default: break;
    }
  }
  if (!state.visible) state.required = false; // a hidden field can't block saving
  return state;
}

export { compareDecimal };
