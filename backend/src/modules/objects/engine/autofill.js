import { z } from 'zod';
import { boundedCondition, evaluateCondition, isValidRef, resolveRef } from './conditions.js';
import { evaluateExpression } from './expression.js';

/** Automatic values for a field. Server-side only; the client receives the resulting value. */
export const AUTOFILL_KINDS = [
  { id: 'current_user', label: 'The current person' }, { id: 'today', label: 'Today’s date' }, { id: 'now', label: 'The current date and time' }, { id: 'workspace', label: 'The current workspace' },
  { id: 'copy', label: 'Copy from another field or a related record' }, { id: 'formula', label: 'Calculate with a formula' }, { id: 'fixed', label: 'A fixed value' },
];
export const autofillSchema = z.object({
  id: z.string().trim().min(1).max(40),
  kind: z.enum(AUTOFILL_KINDS.map((k) => k.id)),
  source: z.string().refine(isValidRef, 'Unknown reference').optional(),
  expression: z.string().min(1).max(2000).optional(),
  value: z.union([z.string().max(2000), z.number(), z.boolean()]).nullable().optional(),
  when: z.enum(['create', 'update', 'change', 'always']).default('create'),
  whenField: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/).optional(),
  overwrite: z.enum(['empty', 'always']).default('empty'),
  editable: z.boolean().default(true),
  lockWhenFilled: z.boolean().default(false),
  clearWhenSourceChanges: z.boolean().default(false),
  snapshot: z.boolean().default(true),
  condition: boundedCondition.nullable().default(null),
  order: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
}).strict().superRefine((a, ctx) => {
  if (a.kind === 'copy' && !a.source) ctx.addIssue({ code: 'custom', path: ['source'], message: 'Choose what to copy from' });
  if (a.kind === 'formula' && !a.expression) ctx.addIssue({ code: 'custom', path: ['expression'], message: 'Enter the formula' });
  if (a.kind === 'fixed' && a.value === undefined) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter the value' });
  if (a.when === 'change' && !a.whenField) ctx.addIssue({ code: 'custom', path: ['whenField'], message: 'Choose the field that triggers it' });
});
export const autofillsSchema = z.array(autofillSchema).max(20);

const blank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function applies(item, ctx, current) {
  const mode = ctx.context?.mode ?? 'edit';
  if (item.when === 'create' && mode !== 'create') return false;
  if (item.when === 'update' && mode !== 'edit') return false;
  if (item.when === 'change' && JSON.stringify(ctx.original?.[item.whenField] ?? null) === JSON.stringify(ctx.this?.[item.whenField] ?? null)) return false;
  if (item.overwrite === 'empty' && !blank(current)) return false;
  return evaluateCondition(item.condition, ctx);
}

/** First matching autofill for this field → { value, editable, lockWhenFilled } or null. */
export function computeAutofill(field, ctx, current) {
  for (const item of [...(field.autofill ?? [])].filter((a) => a.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (!applies(item, ctx, current)) continue;
    let value;
    switch (item.kind) {
      case 'current_user': value = ctx.user?.id; break;
      case 'today': value = (ctx.now ?? new Date()).toISOString().slice(0, 10); break;
      case 'now': value = (ctx.now ?? new Date()).toISOString(); break;
      case 'workspace': value = ctx.user?.workspaceId; break;
      case 'copy': value = resolveRef(item.source, ctx); break;
      case 'formula': { const r = evaluateExpression(item.expression, ctx); value = r.error ? undefined : r.value; break; }
      default: value = item.value;
    }
    if (value === undefined || value === null) continue;
    return { value, editable: item.editable, lockWhenFilled: item.lockWhenFilled, clearWhenSourceChanges: item.clearWhenSourceChanges, snapshot: item.snapshot };
  }
  return null;
}
