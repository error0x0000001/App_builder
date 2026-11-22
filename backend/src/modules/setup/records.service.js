import { SETUP_LIST, labelKey, recordSchemas, statusKey } from '@app/shared';
import { createHash } from 'node:crypto';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { decodeCursor } from '../../shared/pagination.js';

const NS = (ws, collection) => `r:${ws}:${collection}`;
const LIST_TTL_MS = 30_000;

/** List views that can be answered with a filter: "All …", "Active …", "Inactive …". Others are hidden by the API. */
export function resolveView(collection, label) {
  if (!label || /^all\b|^recent/i.test(label)) return {};
  const status = statusKey(collection);
  const active = /^active\b/i.test(label); const inactive = /^inactive\b/i.test(label);
  if (!active && !inactive) return null;
  if (status) return { status: active ? 'Active' : 'Inactive' };
  const check = collection.columns.find((c) => c.type === 'check' && /active/i.test(c.key));
  return check ? { dataFilter: { [check.key]: active } } : null;
}
export const supportedViews = (collection) => (collection.views ?? []).filter((v) => resolveView(collection, v) !== null);

const flatten = (row) => ({ id: row.id, ...row.data, parentId: row.parent_id ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at });

/** Generic list/CRUD engine for every record-backed Setup page. Adapter-backed pages are dispatched to their adapter. */
export class RecordsService {
  constructor({ repos, cache, adapters }) { Object.assign(this, { repos, cache, adapters }); }

  async list(ctx, collection, params) {
    const limit = Math.min(params.limit ?? SETUP_LIST.defaultLimit, SETUP_LIST.maxLimit);
    const adapter = this.adapters[collection.key];
    const compute = async () => (adapter ? adapter.list(ctx, { ...params, limit }) : this.#list(ctx.workspaceId, collection, { ...params, limit }));
    // Adapter data changes outside this service (sessions, logins), so it gets a short TTL; generic data is invalidated by version.
    return this.cache.remember(NS(ctx.workspaceId, collection.key), this.#hash(params, limit), { ttlMs: adapter ? 5_000 : LIST_TTL_MS }, compute);
  }

  async #list(ws, collection, { limit, after, q, view, withTotal, status }) {
    const filter = resolveView(collection, view) ?? {};
    const params = { q: q || undefined, status: status ?? filter.status, dataFilter: filter.dataFilter };
    const cursor = decodeCursor(after)?.id;
    const rows = await this.repos.setupRecords.list(ws, collection.key, { ...params, after: cursor }, limit + 1);
    const items = rows.slice(0, limit).map(flatten);
    const body = { items, nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ id: rows[limit - 1].id })).toString('base64url') : null };
    // Odoo rule (web_search_read): count only on the first page and only when the page came back full.
    if (!after && rows.length <= limit) Object.assign(body, { total: items.length, totalCapped: false });
    else if (withTotal && !after) {
      const n = await this.repos.setupRecords.countCapped(ws, collection.key, params, SETUP_LIST.countCap);
      Object.assign(body, { total: Math.min(n, SETUP_LIST.countCap), totalCapped: n > SETUP_LIST.countCap });
    }
    return body;
  }

  async create(ctx, collection, input) {
    if (this.adapters[collection.key]) return this.adapters[collection.key].create(ctx, input);
    const data = recordSchemas(collection).create.parse(input);
    const row = await this.repos.setupRecords.insert(ctx.workspaceId, collection.key, this.#parts(collection, data, ctx.userId, input));
    await this.#changed(ctx, collection, 'create', `Created ${collection.name}: ${row.label}`);
    return flatten(row);
  }

  async update(ctx, collection, id, input) {
    if (this.adapters[collection.key]) return this.adapters[collection.key].update(ctx, id, input);
    const data = recordSchemas(collection).update.parse(input);
    const { parentId, ...rest } = input;
    const parts = { data };
    const label = labelKey(collection); const status = statusKey(collection);
    if (data[label] !== undefined) parts.label = data[label];
    if (status && data[status] !== undefined) parts.status = data[status];
    if (parentId !== undefined) parts.parentId = parentId;
    const row = await this.repos.setupRecords.update(ctx.workspaceId, collection.key, id, parts);
    if (!row) throw new NotFoundError('Record not found');
    await this.#changed(ctx, collection, 'update', `Changed ${collection.name}: ${row.label}`);
    return flatten(row);
  }

  async remove(ctx, collection, ids) {
    if (ids.length > SETUP_LIST.bulkMax) throw new ValidationError(undefined, `At most ${SETUP_LIST.bulkMax} records at a time`);
    if (this.adapters[collection.key]) return this.adapters[collection.key].remove(ctx, ids);
    const n = await this.repos.setupRecords.remove(ctx.workspaceId, collection.key, ids);
    if (n) await this.#changed(ctx, collection, 'delete', `Deleted ${n} ${collection.name} record(s)`);
    return n;
  }

  /** Nested tree for hierarchy pages (roles). Capped; built in one pass. */
  tree(ctx, collection) {
    return this.cache.remember(NS(ctx.workspaceId, collection.key), 'tree', { ttlMs: LIST_TTL_MS }, async () => {
      const rows = await this.repos.setupRecords.listAll(ctx.workspaceId, collection.key);
      const nodes = new Map(rows.map((r) => [r.id, { id: r.id, name: r.label, assignedTo: r.data.assigned_to ?? '', children: [] }]));
      const roots = [];
      for (const r of rows) (r.parent_id && nodes.has(r.parent_id) ? nodes.get(r.parent_id).children : roots).push(nodes.get(r.id));
      return { roots };
    });
  }

  #parts(collection, data, createdBy, input) {
    const status = statusKey(collection);
    return { label: data[labelKey(collection)], status: status ? data[status] ?? null : null, data, createdBy, parentId: input.parentId ?? null };
  }

  async #changed(ctx, collection, action, summary) {
    await this.cache.bump(NS(ctx.workspaceId, collection.key));
    await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, collection.key, action, summary);
  }

  #hash(params, limit) {
    return createHash('md5').update(JSON.stringify([params.after, params.q, params.view, params.status, params.withTotal ? 1 : 0, limit])).digest('base64url').slice(0, 14);
  }
}
