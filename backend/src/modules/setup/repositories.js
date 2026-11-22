import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { pgArray } from '../../shared/db/helpers.js';

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');
const json = (o) => JSON.stringify(o ?? {});

/** Settings pages: one row per (workspace, page). */
export class SettingsRepository {
  constructor(db) { this.db = db; }

  async get(ws, pageKey) {
    const { rows } = await this.db.execute(sql`select values, version from setup_settings where workspace_id = ${ws} and page_key = ${pageKey}`);
    return rows[0] ?? null;
  }

  /** Claims a one-time marker (e.g. initial seed). True only for the single caller that inserted it. */
  async claim(ws, pageKey) {
    const { rowCount } = await this.db.execute(sql`insert into setup_settings (workspace_id, page_key, values, version) values (${ws}, ${pageKey}, '{}'::jsonb, 1) on conflict do nothing`);
    return rowCount === 1;
  }

  /** Merge-patch with optional optimistic-concurrency check. Returns null when the expected version is stale. */
  async patch(ws, pageKey, patch, userId, expectedVersion) {
    const { rows } = expectedVersion > 0
      ? await this.db.execute(sql`
          update setup_settings set values = values || ${json(patch)}::jsonb, version = version + 1, updated_by = ${userId}, updated_at = now()
          where workspace_id = ${ws} and page_key = ${pageKey} and version = ${expectedVersion} returning values, version`)
      : await this.db.execute(sql`
          insert into setup_settings (workspace_id, page_key, values, version, updated_by, updated_at)
          values (${ws}, ${pageKey}, ${json(patch)}::jsonb, 1, ${userId}, now())
          on conflict (workspace_id, page_key) do nothing
          returning values, version`);
    return rows[0] ?? null;
  }
}

/** Generic record store (hash-partitioned by workspace). Every query is `workspace_id`-first so partition pruning + the list index apply. */
export class RecordsRepository {
  constructor(db) { this.db = db; }

  #where(ws, collection, { after, q, status, dataFilter, parentId } = {}) {
    const c = [sql`workspace_id = ${ws}`, sql`collection = ${collection}`];
    if (after) c.push(sql`id < ${after}::uuid`);
    if (status) c.push(sql`status = ${status}`);
    if (q) c.push(sql`label ilike ${`%${escapeLike(q)}%`}`);
    if (dataFilter) c.push(sql`data @> ${json(dataFilter)}::jsonb`);
    if (parentId !== undefined) c.push(parentId === null ? sql`parent_id is null` : sql`parent_id = ${parentId}::uuid`);
    return sql.join(c, sql` and `);
  }

  async list(ws, collection, params, limit) {
    const { rows } = await this.db.execute(sql`
      select id, label, status, data, parent_id, created_by, created_at, updated_at from setup_records
      where ${this.#where(ws, collection, params)} order by id desc limit ${limit}`);
    return rows;
  }

  /** Counts at most `cap`+1 rows (Odoo `count_limit`): O(cap) however large the table is. */
  async countCapped(ws, collection, params, cap) {
    const { rows } = await this.db.execute(sql`select count(*)::int as n from (select 1 from setup_records where ${this.#where(ws, collection, { ...params, after: undefined })} limit ${cap + 1}) t`);
    return rows[0].n;
  }

  async get(ws, collection, id) {
    const { rows } = await this.db.execute(sql`select id, label, status, data, parent_id, created_by, created_at, updated_at from setup_records where workspace_id = ${ws} and collection = ${collection} and id = ${id}::uuid`);
    return rows[0] ?? null;
  }

  /** The record of a collection whose label matches exactly (e.g. an object by its API name). */
  async findByLabel(ws, collection, label) {
    const { rows } = await this.db.execute(sql`select id, label, status, data, parent_id from setup_records where workspace_id = ${ws} and collection = ${collection} and label = ${label} limit 1`);
    return rows[0] ?? null;
  }

  /** First record whose data contains `fields` (jsonb containment, served by the partial GIN index for object records). */
  async findByData(ws, collection, fields, excludeId) {
    const { rows } = await this.db.execute(sql`select id, label from setup_records where workspace_id = ${ws} and collection = ${collection} and data @> ${json(fields)}::jsonb ${excludeId ? sql`and id <> ${excludeId}::uuid` : sql``} limit 1`);
    return rows[0] ?? null;
  }

  /** Records of a collection older than `hours`, not in a closed state, that are candidates for escalation (bounded batch). */
  async listOlderThan(ws, collection, hours, limit) {
    const { rows } = await this.db.execute(sql`select id, label, status, data from setup_records where workspace_id = ${ws} and collection = ${collection} and created_at < now() - (${hours}::numeric * interval '1 hour') and coalesce(lower(data->>'status'), '') not in ('closed', 'resolved') order by id limit ${limit}`);
    return rows;
  }

  /** Workspaces that have at least one active rule in a collection. */
  async workspacesWithActive(collection) {
    const { rows } = await this.db.execute(sql`select distinct workspace_id from setup_records where collection = ${collection} and status = 'Active'`);
    return rows.map((r) => r.workspace_id);
  }

  async insert(ws, collection, { label, status = null, data, parentId = null, createdBy = null }) {
    const id = uuidv7();
    const { rows } = await this.db.execute(sql`
      insert into setup_records (id, workspace_id, collection, parent_id, label, status, data, created_by)
      values (${id}::uuid, ${ws}, ${collection}, ${parentId}, ${label}, ${status}, ${json(data)}::jsonb, ${createdBy})
      returning id, label, status, data, parent_id, created_by, created_at, updated_at`);
    return rows[0];
  }

  /** Multi-row insert (import / seeding); returns the number inserted. */
  async insertMany(ws, collection, items, createdBy = null) {
    if (!items.length) return 0;
    const values = items.map((i) => sql`(${uuidv7()}::uuid, ${ws}, ${collection}, ${i.parentId ?? null}, ${i.label}, ${i.status ?? null}, ${json(i.data)}::jsonb, ${createdBy})`);
    await this.db.execute(sql`insert into setup_records (id, workspace_id, collection, parent_id, label, status, data, created_by) values ${sql.join(values, sql`, `)}`);
    return items.length;
  }

  async update(ws, collection, id, { label, status, data, parentId }) {
    const sets = [sql`updated_at = now()`];
    if (data) sets.push(sql`data = data || ${json(data)}::jsonb`);
    if (label !== undefined) sets.push(sql`label = ${label}`);
    if (status !== undefined) sets.push(sql`status = ${status}`);
    if (parentId !== undefined) sets.push(sql`parent_id = ${parentId}`);
    const { rows } = await this.db.execute(sql`update setup_records set ${sql.join(sets, sql`, `)} where workspace_id = ${ws} and collection = ${collection} and id = ${id}::uuid returning id, label, status, data, parent_id, created_by, created_at, updated_at`);
    return rows[0] ?? null;
  }

  async remove(ws, collection, ids) {
    if (!ids.length) return 0;
    const { rowCount } = await this.db.execute(sql`delete from setup_records where workspace_id = ${ws} and collection = ${collection} and id = any(${pgArray(ids, 'uuid')})`);
    return rowCount;
  }

  /** Delete matching rows in bounded batches so a mass delete never holds a long lock. */
  async removeWhere(ws, collection, { status } = {}, batch = 5000) {
    let total = 0;
    for (;;) {
      const { rowCount } = await this.db.execute(sql`
        delete from setup_records where (workspace_id, id) in (select workspace_id, id from setup_records where ${this.#where(ws, collection, { status })} limit ${batch})`);
      total += rowCount;
      if (rowCount < batch) return total;
    }
  }

  async hasChildren(ws, parentIds) {
    const { rows } = await this.db.execute(sql`select 1 from setup_records where workspace_id = ${ws} and parent_id = any(${pgArray(parentIds, 'uuid')}) and id <> all(${pgArray(parentIds, 'uuid')}) limit 1`);
    return rows.length > 0;
  }

  /** Deletes the child records of the given parents (e.g. an object's fields). */
  async removeChildren(ws, collection, parentIds) {
    const { rowCount } = await this.db.execute(sql`delete from setup_records where workspace_id = ${ws} and collection = ${collection} and parent_id = any(${pgArray(parentIds, 'uuid')})`);
    return rowCount;
  }

  async reassignCreator(ws, collection, from, to) {
    const { rowCount } = await this.db.execute(sql`update setup_records set created_by = ${to}::uuid, updated_at = now() where workspace_id = ${ws} and collection = ${collection} and created_by = ${from}::uuid`);
    return rowCount;
  }

  async listAll(ws, collection, cap = 5000) {
    const { rows } = await this.db.execute(sql`select id, label, status, data, parent_id from setup_records where workspace_id = ${ws} and collection = ${collection} order by id limit ${cap}`);
    return rows;
  }

  async countsByCollection(ws, collections) {
    const { rows } = await this.db.execute(sql`select collection, count(*)::int as n from setup_records where workspace_id = ${ws} and collection = any(${pgArray(collections, 'text')}) group by collection`);
    return Object.fromEntries(rows.map((r) => [r.collection, r.n]));
  }

  async storageByCollection(ws) {
    const { rows } = await this.db.execute(sql`select collection, count(*)::int as n, coalesce(sum(pg_column_size(data) + length(label) + 60), 0)::bigint as bytes from setup_records where workspace_id = ${ws} group by collection order by bytes desc`);
    return rows.map((r) => ({ collection: r.collection, n: r.n, bytes: Number(r.bytes) }));
  }
}

export class SetupAuditRepository {
  constructor(db) { this.db = db; }

  record(ws, userId, pageKey, action, summary) {
    return this.db.execute(sql`insert into setup_audit (id, workspace_id, user_id, page_key, action, summary) values (${uuidv7()}::uuid, ${ws}, ${userId}, ${pageKey}, ${action}, ${summary.slice(0, 500)})`);
  }

  async list(ws, { limit, after }) {
    const cursor = after ? sql`and a.id < ${after}::uuid` : sql``;
    const { rows } = await this.db.execute(sql`
      select a.id, a.page_key, a.action, a.summary, a.created_at, u.email from setup_audit a left join users u on u.id = a.user_id
      where a.workspace_id = ${ws} ${cursor} order by a.id desc limit ${limit}`);
    return rows;
  }
}
