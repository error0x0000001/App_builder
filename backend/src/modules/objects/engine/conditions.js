import { z } from 'zod';

/**
 * Condition trees: the one expression format behind rules, validations, lookup filters, autofill and list filters.
 * It is evaluated ONLY on the server; clients render the result.
 *
 *   leaf:  { ref: 'this.stage', operator: 'eq', value: 'Won' }       (or valueRef: 'parent.currency')
 *   group: { op: 'and' | 'or', conditions: [...] }   |   { op: 'not', condition: {...} }
 *
 * Refs: this.<field> · this.<lookup>.<field> · parent.<field> · parent.<lookup>.<field> · line.<field> · lines.count · lines.sum.<field>
 *       lines.min.<field> · lines.max.<field> · user.<id|role|profile|permissionSets|workspaceId|hierarchyRoles> · context.<mode|device|recordType|isOwner> · today · now
 */
export const OPERATORS = [
  { id: 'eq', label: 'equals', operands: 1 }, { id: 'ne', label: 'does not equal', operands: 1 },
  { id: 'gt', label: 'is greater than', operands: 1 }, { id: 'gte', label: 'is at least', operands: 1 },
  { id: 'lt', label: 'is less than', operands: 1 }, { id: 'lte', label: 'is at most', operands: 1 },
  { id: 'between', label: 'is between', operands: 2 }, { id: 'in', label: 'is one of', operands: 'list' }, { id: 'nin', label: 'is none of', operands: 'list' },
  { id: 'contains', label: 'contains', operands: 1 }, { id: 'startsWith', label: 'starts with', operands: 1 }, { id: 'endsWith', label: 'ends with', operands: 1 },
  { id: 'empty', label: 'is blank', operands: 0 }, { id: 'notEmpty', label: 'is not blank', operands: 0 }, { id: 'changed', label: 'has changed', operands: 0 },
];
const OPERATOR_IDS = OPERATORS.map((o) => o.id);

export const REF_SOURCES = [
  { id: 'this', label: 'This record' }, { id: 'parent', label: 'Parent record' }, { id: 'line', label: 'This line' }, { id: 'lines', label: 'All lines' },
  { id: 'user', label: 'Current person' }, { id: 'context', label: 'Context' },
];
export const USER_REFS = ['id', 'role', 'profile', 'permissionSets', 'workspaceId', 'hierarchyRoles'];
export const CONTEXT_REFS = ['mode', 'device', 'recordType', 'isOwner'];
export const LINES_FUNCTIONS = ['count', 'sum', 'min', 'max'];

const REF = /^(?:(?:this|parent|line)\.[A-Za-z][A-Za-z0-9_]{0,40}(?:\.[A-Za-z][A-Za-z0-9_]{0,40})?|lines\.count|lines\.(?:sum|min|max)\.[A-Za-z][A-Za-z0-9_]{0,40}|user\.(?:id|role|profile|permissionSets|workspaceId|hierarchyRoles)|context\.(?:mode|device|recordType|isOwner)|today|now)$/;
export const isValidRef = (ref) => typeof ref === 'string' && REF.test(ref);

const scalar = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const leaf = z.object({
  ref: z.string().refine(isValidRef, 'Unknown reference'),
  operator: z.enum(OPERATOR_IDS),
  value: z.union([scalar, z.array(scalar).max(100)]).optional(),
  valueRef: z.string().refine(isValidRef, 'Unknown reference').optional(),
}).strict();

export const conditionSchema = z.lazy(() => z.union([
  leaf,
  z.object({ op: z.enum(['and', 'or']), conditions: z.array(conditionSchema).min(1).max(30) }).strict(),
  z.object({ op: z.literal('not'), condition: conditionSchema }).strict(),
]));

export const MAX_DEPTH = 6;
export const MAX_NODES = 60;
export function conditionShape(node, depth = 1) {
  if (depth > MAX_DEPTH) return { nodes: Infinity };
  if (node.op === 'not') return { nodes: 1 + conditionShape(node.condition, depth + 1).nodes };
  if (node.op) return { nodes: 1 + node.conditions.reduce((n, c) => n + conditionShape(c, depth + 1).nodes, 0) };
  return { nodes: 1 };
}
export const boundedCondition = conditionSchema.refine((c) => conditionShape(c).nodes <= MAX_NODES, 'This condition is too large or too deep');

/** Every reference a tree reads (for dependency checks). */
export function conditionRefs(node, out = new Set()) {
  if (!node) return out;
  if (node.op === 'not') conditionRefs(node.condition, out);
  else if (node.op) node.conditions.forEach((c) => conditionRefs(c, out));
  else { out.add(node.ref); if (node.valueRef) out.add(node.valueRef); }
  return out;
}

// ------------------------------------------------------------------------------------------------------- evaluation

const isBlank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const numeric = (v) => (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()));

/** Exact comparison of decimal strings (no floating point). Returns -1, 0, 1. */
export function compareDecimal(a, b) {
  const parse = (x) => { const s = String(x).trim(); const neg = s.startsWith('-'); const [i, f = ''] = s.replace('-', '').split('.'); return { neg, i: i.replace(/^0+(?=\d)/, ''), f: f.replace(/0+$/, '') }; };
  const x = parse(a); const y = parse(b);
  const zero = (p) => p.i === '0' && p.f === '';
  if (zero(x) && zero(y)) return 0;
  if (x.neg !== y.neg) return x.neg ? -1 : 1;
  const mag = x.i.length !== y.i.length ? Math.sign(x.i.length - y.i.length) : x.i !== y.i ? (x.i < y.i ? -1 : 1) : (() => { const n = Math.max(x.f.length, y.f.length); const p = x.f.padEnd(n, '0'); const q = y.f.padEnd(n, '0'); return p === q ? 0 : p < q ? -1 : 1; })();
  return x.neg ? -mag : mag;
}
const compare = (a, b) => (numeric(a) && numeric(b) ? compareDecimal(a, b) : String(a ?? '').localeCompare(String(b ?? ''), 'en', { sensitivity: 'base' }));

/** Reads a reference from the evaluation context. */
export function resolveRef(ref, ctx) {
  const parts = ref.split('.');
  const [src] = parts;
  if (src === 'today') return (ctx.now ?? new Date()).toISOString().slice(0, 10);
  if (src === 'now') return (ctx.now ?? new Date()).toISOString();
  if (src === 'user') return ctx.user?.[parts[1]];
  if (src === 'context') return ctx.context?.[parts[1]];
  if (src === 'lines') {
    const rows = ctx.lines ?? [];
    if (parts[1] === 'count') return rows.length;
    const nums = rows.map((r) => r?.[parts[2]]).filter((v) => numeric(v)).map(Number);
    if (parts[1] === 'sum') return nums.reduce((s, n) => s + n, 0);
    if (!nums.length) return null;
    return parts[1] === 'min' ? Math.min(...nums) : Math.max(...nums);
  }
  const scope = src === 'this' ? ctx.this : src === 'parent' ? ctx.parent : ctx.line;
  if (parts.length === 3) return (src === 'this' ? ctx.related : src === 'parent' ? ctx.parentRelated : ctx.lineRelated)?.[parts[1]]?.[parts[2]];
  return scope?.[parts[1]];
}

function test(op, left, right, right2) {
  switch (op) {
    case 'empty': return isBlank(left);
    case 'notEmpty': return !isBlank(left);
    case 'eq': return Array.isArray(left) ? left.includes(right) : numeric(left) && numeric(right) ? compareDecimal(left, right) === 0 : left === right || (left != null && right != null && String(left) === String(right));
    case 'ne': return !test('eq', left, right);
    case 'gt': return !isBlank(left) && compare(left, right) > 0;
    case 'gte': return !isBlank(left) && compare(left, right) >= 0;
    case 'lt': return !isBlank(left) && compare(left, right) < 0;
    case 'lte': return !isBlank(left) && compare(left, right) <= 0;
    case 'between': return !isBlank(left) && compare(left, right) >= 0 && compare(left, right2) <= 0;
    case 'in': return (Array.isArray(right) ? right : [right]).some((r) => (Array.isArray(left) ? left.includes(r) : test('eq', left, r)));
    case 'nin': return !test('in', left, right);
    case 'contains': return Array.isArray(left) ? left.includes(right) : String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    case 'startsWith': return String(left ?? '').toLowerCase().startsWith(String(right ?? '').toLowerCase());
    case 'endsWith': return String(left ?? '').toLowerCase().endsWith(String(right ?? '').toLowerCase());
    default: return false;
  }
}

/** Evaluates a condition tree against `ctx`. A missing/null tree is "always true". */
export function evaluateCondition(node, ctx) {
  if (!node) return true;
  if (node.op === 'and') return node.conditions.every((c) => evaluateCondition(c, ctx));
  if (node.op === 'or') return node.conditions.some((c) => evaluateCondition(c, ctx));
  if (node.op === 'not') return !evaluateCondition(node.condition, ctx);
  const left = resolveRef(node.ref, ctx);
  if (node.operator === 'changed') { const key = node.ref.split('.')[1]; return JSON.stringify(ctx.original?.[key] ?? null) !== JSON.stringify(left ?? null); }
  const right = node.valueRef ? resolveRef(node.valueRef, ctx) : Array.isArray(node.value) && node.operator !== 'in' && node.operator !== 'nin' && node.operator !== 'between' ? node.value[0] : node.value;
  const value2 = node.operator === 'between' && Array.isArray(node.value) ? node.value[1] : undefined;
  return test(node.operator, left, node.operator === 'between' && Array.isArray(node.value) ? node.value[0] : right, value2);
}
