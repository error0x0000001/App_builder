import { getCollection } from '@app/shared/setup-registry';
import { objectRecordSchema, toObjectField } from '@app/shared';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';

const coll = (key) => `obj:${key}`;
const NS = (ws, key) => `r:${ws}:${coll(key)}`;
const SEARCH_NS = (ws) => `search:${ws}`; // keep in step with searchNs() in search.service.js
const today = () => new Date().toISOString().slice(0, 10);
const flat = (row) => ({ id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at });

/**
 * Records of any object (standard or custom) defined in Object Manager. Fields, types and required flags come from
 * the Object Manager records of the workspace, so adding a field there changes validation and the UI at once.
 * Storage is the generic partitioned record store under collection `obj:<Object>`.
 */
export class ObjectsService {
  constructor({ repos, records, cache, automation, access }) { Object.assign(this, { repos, records, cache, automation, access }); }

  /** { key, plural, nameKey, statusKey, fields } — cached; invalidated when Object Manager records change. */
  definition(ws, key) {
    return this.cache.rememberValue(`r:${ws}:object-manager-fields`, `def:${key}`, { ttlMs: 30_000, staleMs: 300_000 }, async () => { // stale-while-revalidate: a refresh never blocks a request
      await this.records.ensureSeeded(ws, getCollection('object-manager-objects'));
      const object = await this.repos.setupRecords.findByLabel(ws, 'object-manager-objects', key);
      if (!object) return null;
      const rows = await this.repos.setupRecords.list(ws, 'object-manager-fields', { parentId: object.id }, 500);
      const seen = new Set();
      const fields = rows.reverse().map((r) => toObjectField(r.data)).filter((f) => !seen.has(f.key) && seen.add(f.key));
      const nameField = fields.find((f) => f.key === 'name') ?? fields.find((f) => f.input === 'text' && !f.readOnly) ?? fields[0];
      return {
        key, id: object.id, fields, nameKey: nameField?.key, statusKey: fields.find((f) => f.key === 'status')?.key ?? null,
        plural: (object.data.description ?? '').split(' (')[0] || `${key}s`,
      };
    });
  }

  async #require(ws, key) {
    const def = await this.definition(ws, key);
    if (!def) throw new NotFoundError('Unknown object');
    return def;
  }

  /** What the signed-in user may do with this object (drives the UI's buttons; the service enforces it regardless). */
  async permissions(ctx, key) {
    const { read, create, edit, delete: del, scope } = await this.access.forObject(ctx, await this.#require(ctx.workspaceId, key));
    return { read, create, edit, delete: del, scope };
  }

  /**
   * What the person may search: collections they can read in full, collections where they only see their own records
   * (Private sharing), and a label per collection. Uses the cached definitions and access indexes, so it is cheap per request.
   */
  async readScopes(ctx) {
    const keys = await this.cache.rememberValue(`r:${ctx.workspaceId}:object-manager-objects`, 'keys', { ttlMs: 30_000, staleMs: 300_000 }, async () => {
      await this.records.ensureSeeded(ctx.workspaceId, getCollection('object-manager-objects'));
      return (await this.repos.setupRecords.listAll(ctx.workspaceId, 'object-manager-objects')).map((r) => r.label);
    });
    const all = []; const own = []; const plural = new Map();
    await Promise.all(keys.map(async (key) => {
      const def = await this.definition(ctx.workspaceId, key);
      if (!def) return;
      const perms = await this.access.forObject(ctx, def);
      if (!perms.read) return;
      plural.set(coll(key), def.plural);
      if (perms.scope === 'own') { if (perms.ownerKey && ctx.email) own.push({ collection: coll(key), ownerKey: perms.ownerKey }); } else all.push(coll(key));
    }));
    return { all, own, plural };
  }

  /** One record, under the same read permission and sharing scope as the list. */
  async get(ctx, key, id) {
    const def = await this.#require(ctx.workspaceId, key);
    const perms = await this.access.forObject(ctx, def);
    this.access.assert(perms, 'read');
    const row = await this.repos.setupRecords.get(ctx.workspaceId, coll(key), id);
    if (!row || (perms.scope === 'own' && !this.access.mayChange(perms, ctx, row.data))) throw new NotFoundError('Record not found');
    return { record: flat(row) };
  }

  async list(ctx, key, params) {
    const def = await this.#require(ctx.workspaceId, key);
    const perms = await this.access.forObject(ctx, def);
    this.access.assert(perms, 'read');
    const owner = perms.scope === 'own' && perms.ownerKey ? { key: perms.ownerKey, value: ctx.email } : undefined; // Private records: own only
    return this.records.list(ctx, { key: coll(key), name: def.plural, columns: [], views: [] }, { ...params, owner });
  }

  async create(ctx, key, input) {
    const def = await this.#require(ctx.workspaceId, key);
    this.access.assert(await this.access.forObject(ctx, def), 'create');
    const parsed = objectRecordSchema(def.fields, 'create').parse(input ?? {});
    const data = this.#defaults(def, parsed, ctx);
    const { data: prepared, warnings } = await this.automation.beforeSave(ctx, def, data, { mode: 'create' });
    const row = await this.repos.setupRecords.insert(ctx.workspaceId, coll(key), this.#parts(def, prepared, ctx.userId));
    await Promise.all([this.cache.bump(NS(ctx.workspaceId, key)), this.cache.bump(SEARCH_NS(ctx.workspaceId))]);
    const saved = await this.automation.afterSave(ctx, def, row, { mode: 'create' });
    return { record: flat(saved), warnings };
  }

  async update(ctx, key, id, input) {
    const def = await this.#require(ctx.workspaceId, key);
    const existing = await this.repos.setupRecords.get(ctx.workspaceId, coll(key), id);
    if (!existing) throw new NotFoundError('Record not found');
    const perms = await this.access.forObject(ctx, def);
    this.access.assert(perms, 'edit');
    if (!this.access.mayChange(perms, ctx, existing.data)) throw new ForbiddenError('Only the record owner can change this record');
    const changes = objectRecordSchema(def.fields, 'update').parse(input ?? {});
    const merged = { ...existing.data, ...changes };
    const { data: prepared, warnings } = await this.automation.beforeSave(ctx, def, merged, { mode: 'update', id });
    const parts = this.#parts(def, prepared, null);
    const row = await this.repos.setupRecords.update(ctx.workspaceId, coll(key), id, { data: prepared, label: parts.label, status: parts.status });
    await Promise.all([this.cache.bump(NS(ctx.workspaceId, key)), this.cache.bump(SEARCH_NS(ctx.workspaceId))]);
    const saved = await this.automation.afterSave(ctx, def, row, { mode: 'update' });
    return { record: flat(saved), warnings };
  }

  invalidate(ws, key) { return Promise.all([this.cache.bump(NS(ws, key)), this.cache.bump(SEARCH_NS(ws))]); }

  async remove(ctx, key, ids) {
    const def = await this.#require(ctx.workspaceId, key);
    const perms = await this.access.forObject(ctx, def);
    this.access.assert(perms, 'delete');
    if (perms.scope !== 'all') {
      for (const id of ids) {
        const row = await this.repos.setupRecords.get(ctx.workspaceId, coll(key), id);
        if (row && !this.access.mayChange(perms, ctx, row.data)) throw new ForbiddenError('Only the record owner can delete this record');
      }
    }
    const removed = await this.repos.setupRecords.remove(ctx.workspaceId, coll(key), ids);
    await Promise.all([this.cache.bump(NS(ctx.workspaceId, key)), this.cache.bump(SEARCH_NS(ctx.workspaceId))]);
    return removed;
  }

  async decide(ctx, key, id, decision) {
    const def = await this.#require(ctx.workspaceId, key);
    return { record: flat(await this.automation.decide(ctx, def, id, decision)) };
  }

  /** Created date = today, owner fields = the creator, auto-numbered cases. */
  #defaults(def, data, ctx) {
    const out = { ...data };
    for (const f of def.fields) {
      if (out[f.key] !== undefined && out[f.key] !== '') continue;
      if (f.key === 'created_date') out[f.key] = today();
      else if (/owner/.test(f.key) && ctx.email) out[f.key] = ctx.email;
      else if (f.key === 'case_number') out[f.key] = `CS-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36 ** 2).toString(36).toUpperCase()}`;
    }
    return out;
  }

  #parts(def, data, createdBy) {
    return { label: String(data[def.nameKey] ?? def.key).slice(0, 500), status: def.statusKey ? data[def.statusKey] ?? null : null, data, createdBy };
  }
}
