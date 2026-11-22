import { getCollection } from '@app/shared/setup-registry';
import { objectRecordSchema, toObjectField } from '@app/shared';
import { NotFoundError } from '../../shared/errors.js';

const coll = (key) => `obj:${key}`;
const NS = (ws, key) => `r:${ws}:${coll(key)}`;
const today = () => new Date().toISOString().slice(0, 10);
const flat = (row) => ({ id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at });

/**
 * Records of any object (standard or custom) defined in Object Manager. Fields, types and required flags come from
 * the Object Manager records of the workspace, so adding a field there changes validation and the UI at once.
 * Storage is the generic partitioned record store under collection `obj:<Object>`.
 */
export class ObjectsService {
  constructor({ repos, records, cache, automation }) { Object.assign(this, { repos, records, cache, automation }); }

  /** { key, plural, nameKey, statusKey, fields } — cached; invalidated when Object Manager records change. */
  definition(ws, key) {
    return this.cache.rememberValue(`r:${ws}:object-manager-fields`, `def:${key}`, { ttlMs: 30_000 }, async () => {
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

  async list(ctx, key, params) {
    const def = await this.#require(ctx.workspaceId, key);
    return this.records.list(ctx, { key: coll(key), name: def.plural, columns: [], views: [] }, params);
  }

  async create(ctx, key, input) {
    const def = await this.#require(ctx.workspaceId, key);
    const parsed = objectRecordSchema(def.fields, 'create').parse(input ?? {});
    const data = this.#defaults(def, parsed, ctx);
    const { data: prepared, warnings } = await this.automation.beforeSave(ctx, def, data, { mode: 'create' });
    const row = await this.repos.setupRecords.insert(ctx.workspaceId, coll(key), this.#parts(def, prepared, ctx.userId));
    await this.cache.bump(NS(ctx.workspaceId, key));
    const saved = await this.automation.afterSave(ctx, def, row, { mode: 'create' });
    return { record: flat(saved), warnings };
  }

  async update(ctx, key, id, input) {
    const def = await this.#require(ctx.workspaceId, key);
    const existing = await this.repos.setupRecords.get(ctx.workspaceId, coll(key), id);
    if (!existing) throw new NotFoundError('Record not found');
    const changes = objectRecordSchema(def.fields, 'update').parse(input ?? {});
    const merged = { ...existing.data, ...changes };
    const { data: prepared, warnings } = await this.automation.beforeSave(ctx, def, merged, { mode: 'update', id });
    const parts = this.#parts(def, prepared, null);
    const row = await this.repos.setupRecords.update(ctx.workspaceId, coll(key), id, { data: prepared, label: parts.label, status: parts.status });
    await this.cache.bump(NS(ctx.workspaceId, key));
    const saved = await this.automation.afterSave(ctx, def, row, { mode: 'update' });
    return { record: flat(saved), warnings };
  }

  async remove(ctx, key, ids) {
    await this.#require(ctx.workspaceId, key);
    const removed = await this.repos.setupRecords.remove(ctx.workspaceId, coll(key), ids);
    await this.cache.bump(NS(ctx.workspaceId, key));
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
