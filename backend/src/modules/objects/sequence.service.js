import { sql } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '../../shared/errors.js';

const pad = (n, w) => String(n).padStart(w, '0');

/** The period a number belongs to, so the count can start again (never → one counter for ever). */
export function periodOf(cycle, at = new Date()) {
  const y = at.getUTCFullYear(); const m = pad(at.getUTCMonth() + 1, 2); const d = pad(at.getUTCDate(), 2);
  return cycle === 'yearly' ? `${y}` : cycle === 'monthly' ? `${y}-${m}` : cycle === 'daily' ? `${y}-${m}-${d}` : '';
}

/** `SHP-{YYYY}-{0000}` + 42 → `SHP-2026-0042`. The run of zeros is the minimum number of digits. */
export function formatSequence(format, n, at = new Date()) {
  const y = at.getUTCFullYear();
  return String(format ?? 'N-{0000}')
    .replace(/\{(0+)\}/g, (_, zeros) => pad(n, zeros.length))
    .replace(/\{YYYY\}/g, String(y)).replace(/\{YY\}/g, String(y).slice(-2))
    .replace(/\{MM\}/g, pad(at.getUTCMonth() + 1, 2)).replace(/\{DD\}/g, pad(at.getUTCDate(), 2));
}

/**
 * Record numbers. One row per (field, scope, period) in `field_sequences`, advanced by a single atomic upsert: the row lock makes concurrent
 * callers queue, and when `next` runs inside the record's own transaction a rolled-back record gives its number back (no gaps).
 * (Odoo's "standard" mode uses a PostgreSQL SEQUENCE per counter — fast but gaps; its "no gap" mode locks a row like this. NocoBase reads then
 * saves a `sequences` row inside the record transaction. Thousands of tenants × fields rule out one PG sequence each.)
 */
export class SequenceService {
  constructor({ db }) { this.db = db; }

  #scope(field, tenantId, workspaceId) { return field.settings?.scope === 'tenant' || !workspaceId ? tenantId : workspaceId; }

  /** Takes the next number and returns the formatted value. Pass the record's transaction as `executor` to make it gap-free. */
  async next({ tenantId, workspaceId, field, at = new Date(), executor = this.db }) {
    if (field.type !== 'auto_number') throw new ConflictError('This field is not an auto-number');
    const s = field.settings ?? {};
    const start = s.start ?? 1; const step = s.increment ?? 1;
    const rows = await executor.execute(sql`
      insert into field_sequences (tenant_id, object_id, field_id, scope_id, period, current)
      values (${tenantId}, ${field.objectId}, ${field.id}, ${this.#scope(field, tenantId, workspaceId)}, ${periodOf(s.cycle, at)}, ${start})
      on conflict (field_id, scope_id, period) do update set current = field_sequences.current + ${step}, updated_at = now()
      returning current`);
    return { number: Number(rows.rows[0].current), value: formatSequence(s.format, Number(rows.rows[0].current), at) };
  }

  /** What the next number will look like, without taking it. */
  async peek({ tenantId, workspaceId, field, at = new Date() }) {
    const s = field.settings ?? {};
    const rows = await this.db.execute(sql`select current from field_sequences where field_id = ${field.id} and scope_id = ${this.#scope(field, tenantId, workspaceId)} and period = ${periodOf(s.cycle, at)}`);
    const next = rows.rows[0] ? Number(rows.rows[0].current) + (s.increment ?? 1) : (s.start ?? 1);
    return { number: next, value: formatSequence(s.format, next, at), taken: rows.rows[0] ? Number(rows.rows[0].current) : null };
  }

  /** Several upcoming values for a format (used by the field editor to show an example). */
  example({ format, start = 1, increment = 1, at = new Date(), count = 3 }) { return Array.from({ length: count }, (_, i) => formatSequence(format, start + i * increment, at)); }

  /** An administrator sets the last number issued in the current period. */
  async reset({ tenantId, workspaceId, field, to, at = new Date() }) {
    const s = field.settings ?? {};
    const rows = await this.db.execute(sql`
      insert into field_sequences (tenant_id, object_id, field_id, scope_id, period, current) values (${tenantId}, ${field.objectId}, ${field.id}, ${this.#scope(field, tenantId, workspaceId)}, ${periodOf(s.cycle, at)}, ${to})
      on conflict (field_id, scope_id, period) do update set current = ${to}, updated_at = now() returning current`);
    if (!rows.rows[0]) throw new NotFoundError('Counter not found');
    return Number(rows.rows[0].current);
  }
}
