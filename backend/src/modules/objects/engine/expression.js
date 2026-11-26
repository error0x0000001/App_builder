import { ValidationError } from '../../../shared/errors.js';
import { isValidRef, resolveRef } from './conditions.js';

/**
 * A small, safe formula language (no eval, no property access, a fixed function list). Server-side only.
 *   Qty * Price * (1 - Discount / 100)      IF(Stage == 'Won', 1, 0)      CONCAT(First, ' ', Last)      SUM(lines.Total)
 * A bare identifier means `this.<identifier>`; `parent.X`, `line.X`, `user.role`, `today` … are the same references conditions use.
 */
const MAX_LENGTH = 4000;
const MAX_DEPTH = 40;

function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) { const m = /^\d*\.?\d+/.exec(src.slice(i)); out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    if (c === '"' || c === "'") { let j = i + 1; let s = ''; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j += 1; s += src[j] ?? ''; j += 1; } if (src[j] !== c) throw new Error('Unclosed text'); out.push({ t: 'str', v: s }); i = j + 1; continue; }
    if (/[A-Za-z_]/.test(c)) { const m = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i)); out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%<>!(),'.includes(c)) { out.push({ t: 'op', v: c }); i += 1; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

const FUNCTIONS = new Set(['IF', 'AND', 'OR', 'NOT', 'ROUND', 'ABS', 'MIN', 'MAX', 'SUM', 'COUNT', 'CONCAT', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'ISBLANK', 'TEXT', 'TODAY', 'NOW', 'FLOOR', 'CEIL']);

/** Parses to an AST (throws on a syntax error). */
export function parseExpression(src) {
  if (typeof src !== 'string' || !src.trim()) throw new Error('Enter an expression');
  if (src.length > MAX_LENGTH) throw new Error('The expression is too long');
  const tokens = tokenize(src); let p = 0;
  const peek = () => tokens[p]; const next = () => tokens[p++];
  const accept = (v) => (peek()?.t === 'op' && peek().v === v ? (p += 1, true) : false);
  const expect = (v) => { if (!accept(v)) throw new Error(`Expected "${v}"`); };
  const level = (ops, sub) => (depth) => { let left = sub(depth); while (peek()?.t === 'op' && ops.includes(peek().v)) { const op = next().v; left = { k: 'bin', op, l: left, r: sub(depth) }; } return left; };
  const guard = (d) => { if (d > MAX_DEPTH) throw new Error('The expression is nested too deeply'); };
  let or; let primary;
  const unary = (d) => { guard(d); if (accept('-')) return { k: 'neg', e: unary(d + 1) }; if (accept('!')) return { k: 'not', e: unary(d + 1) }; return primary(d + 1); };
  const mul = level(['*', '/', '%'], unary); const add = level(['+', '-'], mul); const cmp = level(['<', '>', '<=', '>='], add);
  const eq = level(['==', '!='], cmp); const and = level(['&&'], eq); or = level(['||'], and);
  primary = (d) => {
    guard(d); const t = next();
    if (!t) throw new Error('The expression ends too early');
    if (t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'op' && t.v === '(') { const e = or(d + 1); expect(')'); return e; }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') return { k: 'lit', v: t.v === 'true' };
      if (t.v === 'null') return { k: 'lit', v: null };
      if (peek()?.t === 'op' && peek().v === '(') {
        const name = t.v.toUpperCase(); if (!FUNCTIONS.has(name)) throw new Error(`Unknown function ${t.v}`);
        next(); const args = []; if (!accept(')')) { do { args.push(or(d + 1)); } while (accept(',')); expect(')'); }
        return { k: 'call', name, args };
      }
      if (/^lines\.[A-Za-z_]\w*$/.test(t.v) && !/^lines\.(count|sum|min|max)$/.test(t.v)) return { k: 'ref', ref: t.v, lf: t.v.slice(6) }; // a column of the lines, for SUM / MIN / MAX
      const ref = /^(this|parent|line|lines|user|context)\./.test(t.v) || t.v === 'today' || t.v === 'now' ? t.v : `this.${t.v}`;
      if (!isValidRef(ref) && !/^lines$/.test(t.v)) throw new Error(`Unknown reference ${t.v}`);
      return { k: 'ref', ref };
    }
    throw new Error(`Unexpected "${t.v}"`);
  };
  const ast = or(0);
  if (p < tokens.length) throw new Error(`Unexpected "${tokens[p].v}"`);
  return ast;
}

export function expressionRefs(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.k === 'ref' && !ast.lf) out.add(ast.ref);
  if (ast.k === 'bin') { expressionRefs(ast.l, out); expressionRefs(ast.r, out); }
  if (ast.k === 'neg' || ast.k === 'not') expressionRefs(ast.e, out);
  if (ast.k === 'call') ast.args.forEach((a) => expressionRefs(a, out));
  return out;
}

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const truthy = (v) => !(v === null || v === undefined || v === '' || v === 0 || v === false);

function run(ast, ctx) {
  switch (ast.k) {
    case 'lit': return ast.v;
    case 'ref': return ast.lf ? (ctx.lines ?? []).map((r) => r?.[ast.lf]) : resolveRef(ast.ref, ctx) ?? null;
    case 'neg': return -num(run(ast.e, ctx));
    case 'not': return !truthy(run(ast.e, ctx));
    case 'bin': {
      if (ast.op === '&&') return truthy(run(ast.l, ctx)) && truthy(run(ast.r, ctx));
      if (ast.op === '||') return truthy(run(ast.l, ctx)) || truthy(run(ast.r, ctx));
      const l = run(ast.l, ctx); const r = run(ast.r, ctx);
      switch (ast.op) {
        case '+': return typeof l === 'string' || typeof r === 'string' ? `${l ?? ''}${r ?? ''}` : num(l) + num(r);
        case '-': return num(l) - num(r);
        case '*': return num(l) * num(r);
        case '/': return num(r) === 0 ? null : num(l) / num(r);
        case '%': return num(r) === 0 ? null : num(l) % num(r);
        case '==': return l === r || (l != null && r != null && String(l) === String(r));
        case '!=': return !(l === r || (l != null && r != null && String(l) === String(r)));
        case '<': return num(l) < num(r); case '>': return num(l) > num(r); case '<=': return num(l) <= num(r); default: return num(l) >= num(r);
      }
    }
    default: {
      const a = ast.args;
      const val = (i) => (a[i] ? run(a[i], ctx) : undefined);
      switch (ast.name) {
        case 'IF': return truthy(val(0)) ? val(1) ?? null : val(2) ?? null;
        case 'AND': return a.every((_, i) => truthy(val(i))); case 'OR': return a.some((_, i) => truthy(val(i))); case 'NOT': return !truthy(val(0));
        case 'ROUND': { const f = 10 ** Math.max(0, Math.min(10, num(val(1)))); return Math.round(num(val(0)) * f) / f; }
        case 'ABS': return Math.abs(num(val(0))); case 'FLOOR': return Math.floor(num(val(0))); case 'CEIL': return Math.ceil(num(val(0)));
        case 'MIN': return Math.min(...a.flatMap((_, i) => [].concat(val(i)).map(num))); case 'MAX': return Math.max(...a.flatMap((_, i) => [].concat(val(i)).map(num)));
        case 'SUM': return a.flatMap((_, i) => [].concat(val(i))).reduce((s, v) => s + num(v), 0);
        case 'COUNT': return (ctx.lines ?? []).length;
        case 'CONCAT': return a.map((_, i) => val(i) ?? '').join('');
        case 'LEN': return String(val(0) ?? '').length; case 'UPPER': return String(val(0) ?? '').toUpperCase(); case 'LOWER': return String(val(0) ?? '').toLowerCase(); case 'TRIM': return String(val(0) ?? '').trim();
        case 'ISBLANK': return !truthy(val(0)) && val(0) !== 0 && val(0) !== false;
        case 'TEXT': return String(val(0) ?? '');
        case 'TODAY': return (ctx.now ?? new Date()).toISOString().slice(0, 10); case 'NOW': return (ctx.now ?? new Date()).toISOString();
        default: return null;
      }
    }
  }
}

/** Evaluates an expression; an error never throws (formulas must not break a record) — it returns `{ error }`. */
export function evaluateExpression(src, ctx) {
  try { const v = run(parseExpression(src), ctx); return { value: typeof v === 'number' && !Number.isFinite(v) ? null : v }; } catch (error) { return { value: null, error: error.message }; }
}

/** For saving a definition: throws a ValidationError with a readable message. */
export function assertExpression(src, field = 'expression') {
  try { parseExpression(src); } catch (error) { throw new ValidationError({ [field]: error.message }); }
}
