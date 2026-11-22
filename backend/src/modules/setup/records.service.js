import { SETUP_LIST, labelKey, recordSchemas, statusKey } from '@app/shared';
import { createHash } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { decodeCursor, encodeCursor } from '../../shared/pagination.js';
import { getAdapterMeta } from '@app/shared';
import { getCollection } from '@app/shared/setup-registry';
import { config } from '../../shared/config.js';
import { ipInRange } from './ip.js';
import { hasSeed, roleNodes, seedFlat, seedGroup, seedMembers } from './seeding.js';

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
  constructor({ repos, uow, cache, adapters }) { Object.assign(this, { repos, uow, cache, adapters }); this.seeded = new Set(); }

  async list(ctx, collection, params) {
    const limit = Math.min(params.limit ?? SETUP_LIST.defaultLimit, SETUP_LIST.maxLimit);
    const adapter = this.adapters[collection.key];
    const compute = async () => {
      if (adapter) return adapter.list(ctx, { ...params, limit });
      await this.#ensureSeeded(ctx.workspaceId, collection);
      return this.#list(ctx.workspaceId, collection, { ...params, limit });
    };
    // Adapter data changes outside this service (sessions, logins), so it gets a short TTL; generic data is invalidated by version.
    return this.cache.remember(NS(ctx.workspaceId, collection.key), this.#hash(params, limit), { ttlMs: adapter ? 5_000 : LIST_TTL_MS }, compute);
  }

  /** The first Network Access range must contain the admin's own IP, otherwise saving it would lock them out of the workspace. */
  async #assertNotLockingOut(ctx, collection, data) {
    if (collection.key !== 'network-access' || !ctx.ip) return;
    if ((await this.repos.setupRecords.countCapped(ctx.workspaceId, 'network-access', {}, 1)) > 0) return;
    if (!ipInRange(ctx.ip, data.start_ip_address, data.end_ip_address || data.start_ip_address)) {
      throw new ConflictError(`Your current IP (${ctx.ip}) must be inside the first range, or you would lock yourself out.`);
    }
  }

  #assertWritable(collection) {
    if (collection.readOnly) throw new ForbiddenError('This page is read-only');
  }

  /** Adapter pages declare what they allow; anything else is refused up front instead of failing inside the adapter. */
  #adapter(collection, capability) {
    if (!getAdapterMeta(collection.key)?.[capability]) throw new ForbiddenError('This page does not allow that action');
    return this.adapters[collection.key];
  }

  async #list(ws, collection, { limit, after, q, view, total: wantTotal, status, parent }) {
    const filter = resolveView(collection, view) ?? {};
    const params = { q: q || undefined, status: status ?? filter.status, dataFilter: filter.dataFilter, parentId: parent };
    const cursor = decodeCursor(after)?.id;
    const rows = await this.repos.setupRecords.list(ws, collection.key, { ...params, after: cursor }, limit + 1);
    const items = rows.slice(0, limit).map(flatten);
    const body = { items, nextCursor: rows.length > limit ? encodeCursor({ id: rows[limit - 1].id }) : null };
    // Odoo rule (web_search_read): count only on the first page and only when the page came back full.
    if (!after && rows.length <= limit) Object.assign(body, { total: items.length, totalCapped: false });
    else if (wantTotal && !after) {
      const n = await this.repos.setupRecords.countCapped(ws, collection.key, params, SETUP_LIST.countCap);
      Object.assign(body, { total: Math.min(n, SETUP_LIST.countCap), totalCapped: n > SETUP_LIST.countCap });
    }
    return body;
  }

  async create(ctx, collection, input) {
    if (this.adapters[collection.key]) return this.#adapter(collection, 'canCreate').create(ctx, input);
    this.#assertWritable(collection);
    const { parentId, ...fields } = input ?? {};
    const data = recordSchemas(collection).create.parse(fields);
    await this.#assertNotLockingOut(ctx, collection, data);
    await this.#ensureSeeded(ctx.workspaceId, collection);
    const row = await this.repos.setupRecords.insert(ctx.workspaceId, collection.key, this.#parts(collection, data, ctx.userId, { parentId }));
    await this.changed(ctx, collection, 'create', `Created ${collection.name}: ${row.label}`);
    return flatten(row);
  }

  async update(ctx, collection, id, input) {
    if (this.adapters[collection.key]) return this.#adapter(collection, 'canEdit').update(ctx, id, input);
    this.#assertWritable(collection);
    const { parentId, ...fields } = input ?? {};
    const data = recordSchemas(collection).update.parse(fields);
    const parts = { data };
    const label = labelKey(collection); const status = statusKey(collection);
    if (data[label] !== undefined) parts.label = data[label];
    if (status && data[status] !== undefined) parts.status = data[status];
    if (parentId !== undefined) parts.parentId = parentId;
    const row = await this.repos.setupRecords.update(ctx.workspaceId, collection.key, id, parts);
    if (!row) throw new NotFoundError('Record not found');
    await this.changed(ctx, collection, 'update', `Changed ${collection.name}: ${row.label}`);
    return flatten(row);
  }

  async remove(ctx, collection, ids) {
    if (ids.length > SETUP_LIST.bulkMax) throw new ValidationError(undefined, `At most ${SETUP_LIST.bulkMax} records at a time`);
    if (this.adapters[collection.key]) return this.#adapter(collection, 'canDelete').remove(ctx, ids);
    this.#assertWritable(collection);
    if (collection.key === 'roles' && (await this.repos.setupRecords.hasChildren(ctx.workspaceId, ids))) throw new ConflictError('Remove or move the sub-roles first');
    if (collection.key === 'object-manager-objects') await this.repos.setupRecords.removeChildren(ctx.workspaceId, 'object-manager-fields', ids);
    const n = await this.repos.setupRecords.remove(ctx.workspaceId, collection.key, ids);
    if (n) await this.changed(ctx, collection, 'delete', `Deleted ${n} ${collection.name} record(s)`);
    return n;
  }

  /** Nested tree for hierarchy pages (roles). Capped; built in one pass. */
  tree(ctx, collection) {
    return this.cache.remember(NS(ctx.workspaceId, collection.key), 'tree', { ttlMs: LIST_TTL_MS }, async () => {
      await this.#ensureSeeded(ctx.workspaceId, collection);
      const rows = await this.repos.setupRecords.listAll(ctx.workspaceId, collection.key);
      const nodes = new Map(rows.map((r) => [r.id, { id: r.id, name: r.label, assignedTo: r.data.assigned_to ?? '', children: [] }]));
      const roots = [];
      for (const r of rows) (r.parent_id && nodes.has(r.parent_id) ? nodes.get(r.parent_id).children : roots).push(nodes.get(r.id));
      return { roots };
    });
  }

  /**
   * First touch of a collection in a workspace loads its initial content (from the design fixtures) exactly once:
   * a unique marker row is claimed inside the same transaction as the inserts, so concurrent first requests wait
   * for the commit instead of seeing a half-seeded list.
   */
  async #ensureSeeded(ws, collection) {
    const group = seedGroup(collection.key);
    const memo = `${ws}:${group}`;
    if (this.seeded.has(memo) || !hasSeed(collection.key) && collection.key !== 'roles') { this.seeded.add(memo); return; }
    const created = await this.uow.run(async (repos) => {
      if (!(await repos.setupSettings.claim(ws, `seed:${group}`))) return false;
      for (const key of group === 'roles' ? ['roles'] : seedMembers(group).length ? seedMembers(group) : [group]) {
        const target = key === 'roles' ? collection : getCollection(key);
        if (key === 'roles') await this.#seedRoles(repos, ws);
        else if (key === 'object-manager-objects') await this.#seedObjects(repos, ws);
        else if (key !== 'object-manager-fields') await repos.setupRecords.insertMany(ws, key, seedFlat(target));
      }
      return true;
    });
    this.seeded.add(memo);
    if (created) await this.cache.bump(NS(ws, collection.key));
  }

  /** Standard objects, then their fields linked by parent_id so "fields of object X" is one indexed lookup. */
  async #seedObjects(repos, ws) {
    const parents = new Map();
    for (const row of seedFlat(getCollection('object-manager-objects'))) parents.set(row.label, (await repos.setupRecords.insert(ws, 'object-manager-objects', row)).id);
    const fields = seedFlat(getCollection('object-manager-fields')).map((f) => ({ ...f, parentId: parents.get(f.data.object) }));
    await repos.setupRecords.insertMany(ws, 'object-manager-fields', fields);
  }

  async #seedRoles(repos, ws) {
    const ids = [];
    const workspace = await repos.workspaces.findById(ws);
    for (const node of config.SETUP_SEED_SAMPLE_DATA ? roleNodes() : roleNodes().slice(0, 1)) {
      const root = node.parent === null; // the hierarchy's top node is the workspace itself
      const row = await repos.setupRecords.insert(ws, 'roles', { label: root ? workspace.name : node.label, data: root ? { ...node.data, name: workspace.name } : node.data, parentId: node.parent === null ? null : ids[node.parent] });
      ids.push(row.id);
    }
  }

  #parts(collection, data, createdBy, input) {
    const status = statusKey(collection);
    return { label: data[labelKey(collection)], status: status ? data[status] ?? null : null, data, createdBy, parentId: input.parentId ?? null };
  }

  async changed(ctx, collection, action, summary) {
    await this.cache.bump(NS(ctx.workspaceId, collection.key));
    await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, collection.key, action, summary);
  }

  #hash(params, limit) {
    return createHash('md5').update(JSON.stringify([params.after, params.q, params.view, params.status, params.parent, params.total ? 1 : 0, limit])).digest('base64url').slice(0, 14);
  }
}
