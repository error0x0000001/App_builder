import { computeAutofill } from './autofill.js';
import { evaluateExpression } from './expression.js';
import { computeFieldState } from './rules.js';
import { validateFieldValue, validateRecordRules } from './validation.js';
import { FIELD_TYPES } from './fieldTypes.js';

const blank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * The one entry point the UI calls: given an object's fields, the values typed so far and who/where we are, resolve every field.
 * Order: defaults/autofill → computed fields (formulas) → state (visible / required / read-only / options) → validation.
 * The browser only renders what this returns.
 */
export function evaluateObject({ fields, recordRules = [], values = {}, ctx }) {
  const live = fields.filter((f) => f.active !== false);
  const working = { ...values };
  const here = { ...ctx, this: working };
  const filled = {};
  const auto = {};

  // 1. defaults and autofill, then formulas, in the order fields are laid out (later fields see earlier results)
  for (const field of live) {
    const type = FIELD_TYPES[field.type];
    if (type?.computed) {
      if (field.type === 'formula') {
        const r = evaluateExpression(field.settings?.expression ?? '', here);
        working[field.key] = r.error ? null : (r.value === null && field.settings?.blank !== 'blank' && field.settings?.returnType === 'number' ? 0 : r.value);
        filled[field.key] = { computed: true, error: r.error ?? null };
      }
      continue;
    }
    const state0 = computeFieldState(field, here);
    let current = working[field.key];
    if (blank(current) && state0.default !== undefined) { current = state0.default; working[field.key] = current; filled[field.key] = { from: 'rule' }; }
    if (blank(current) && field.defaultValue !== undefined && field.defaultValue !== null && (ctx.context?.mode ?? 'edit') === 'create') { current = field.defaultValue; working[field.key] = current; filled[field.key] = { from: 'default' }; }
    if (blank(current) && (ctx.context?.mode ?? 'edit') === 'create' && field.type === 'picklist') { const d = (field.settings?.values ?? []).find((v) => v.isDefault && v.active !== false); if (d) { current = d.value; working[field.key] = current; filled[field.key] = { from: 'default' }; } }
    const a = computeAutofill(field, here, current);
    if (a) { working[field.key] = a.value; auto[field.key] = a; filled[field.key] = { from: 'autofill' }; }
  }

  // 2. resolved state + validation per field
  const result = {};
  for (const field of live) {
    const state = computeFieldState(field, here);
    if (auto[field.key]?.lockWhenFilled) state.readOnly = true;
    if (auto[field.key] && auto[field.key].editable === false) state.readOnly = true;
    const value = !state.visible && state.clearWhenHidden ? null : working[field.key];
    const errors = validateFieldValue(field, value, here, state);
    result[field.key] = {
      visible: state.visible, required: state.required, readOnly: state.readOnly, options: state.options, messages: state.messages,
      value: value ?? null, autofilled: filled[field.key]?.from ?? null, computed: Boolean(filled[field.key]?.computed), error: filled[field.key]?.error ?? null,
      cleared: !state.visible && state.clearWhenHidden, errors,
    };
  }
  const recordErrors = validateRecordRules(recordRules, here);
  const valid = recordErrors.length === 0 && Object.values(result).every((r) => r.errors.length === 0);
  return { fields: result, recordErrors, valid };
}
