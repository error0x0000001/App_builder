import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';

const TABLES = { password: 'password_policies', session: 'session_policies', login: 'login_policies' };

/** The three security policies (one row per tenant each, typed columns, optimistic `version`) and the trusted networks. */
export class SecurityRepository {
  constructor(db) { this.db = db; }

  async #rows(query) { return (await this.db.execute(query)).rows; }

  async password(tenantId) { return (await this.#rows(sql`select * from password_policies where tenant_id = ${tenantId}`))[0] ?? null; }
  async session(tenantId) { return (await this.#rows(sql`select * from session_policies where tenant_id = ${tenantId}`))[0] ?? null; }
  async login(tenantId) { return (await this.#rows(sql`select * from login_policies where tenant_id = ${tenantId}`))[0] ?? null; }

  /** Applies a patch of column values if nobody changed the row since `expectedVersion`; returns the new row or null on a conflict. */
  async patch(kind, tenantId, columns, userId, expectedVersion) {
    const table = TABLES[kind];
    const entries = Object.entries(columns);
    const set = entries.map(([k, v]) => sql`${sql.identifier(k)} = ${v}`);
    return (await this.#rows(sql`
      update ${sql.identifier(table)} set ${sql.join(set.length ? [...set, sql`version = version + 1`] : [sql`version = version + 1`], sql`, `)}, updated_by = ${userId}, updated_at = now()
      where tenant_id = ${tenantId} and version = ${expectedVersion} returning *`))[0] ?? null;
  }

  // ---------------------------------------------------------------- trusted networks
  listRanges(tenantId, { limit = 5000, after } = {}) {
    return this.#rows(sql`
      select id, host(start_ip) as start_ip, host(end_ip) as end_ip, description, created_at from network_ranges
      where tenant_id = ${tenantId} ${after ? sql`and (created_at, id) < (${after.t}::timestamptz, ${after.id}::uuid)` : sql``}
      order by created_at desc, id desc limit ${limit}`);
  }
  async countRanges(tenantId) { return (await this.#rows(sql`select count(*)::int as n from network_ranges where tenant_id = ${tenantId}`))[0].n; }
  async createRange(tenantId, { startIp, endIp, description = '' }) {
    return (await this.#rows(sql`insert into network_ranges (tenant_id, start_ip, end_ip, description) values (${tenantId}, ${startIp}::inet, ${endIp || startIp}::inet, ${description}) returning id, host(start_ip) as start_ip, host(end_ip) as end_ip, description, created_at`))[0];
  }
  async updateRange(tenantId, id, { startIp, endIp, description }) {
    return (await this.#rows(sql`update network_ranges set start_ip = coalesce(${startIp ?? null}::inet, start_ip), end_ip = coalesce(${endIp ?? null}::inet, end_ip), description = coalesce(${description ?? null}, description) where tenant_id = ${tenantId} and id = ${id}::uuid returning id, host(start_ip) as start_ip, host(end_ip) as end_ip, description, created_at`))[0] ?? null;
  }
  async deleteRanges(tenantId, ids) { return (await this.db.execute(sql`delete from network_ranges where tenant_id = ${tenantId} and id = any(${pgArray(ids, "uuid")})`)).rowCount; }
}
