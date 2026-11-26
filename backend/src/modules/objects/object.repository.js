import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { fields, objects } from '../../shared/db/schema/index.js';
import { first, pgArray } from '../../shared/db/helpers.js';

const like = (q) => `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
const dir = (order, col) => (order === 'desc' ? desc(col) : asc(col));

export class ObjectRepository {
  constructor(db) { this.db = db; }

  // ------------------------------------------------------------------------------------------------ objects

  /** Filtering, sorting and paging happen here, in SQL — the UI only renders the page it is given. */
  async listObjects(tenantId, { q, kind, archived, sort, order, limit, offset }) {
    const where = and(
      eq(objects.tenantId, tenantId),
      archived === 'true' ? sql`${objects.archivedAt} is not null` : sql`${objects.archivedAt} is null`,
      kind === 'all' ? sql`true` : eq(objects.kind, kind),
      q ? sql`(lower(${objects.label}) like ${like(q)} escape '\\' or lower(${objects.key}) like ${like(q)} escape '\\' or lower(${objects.pluralLabel}) like ${like(q)} escape '\\')` : sql`true`,
    );
    const fieldCount = sql`(select count(*)::int from fields f where f.object_id = objects.id and f.active)`; // written out: a single-table select drops the table name from column references
    const orderBy = sort === 'fields' ? dir(order, fieldCount) : sort === 'key' ? dir(order, sql`lower(${objects.key})`) : sort === 'updated' ? dir(order, objects.updatedAt) : dir(order, sql`lower(${objects.label})`);
    const [items, [total]] = await Promise.all([
      this.db.select({ object: objects, fieldCount: fieldCount.mapWith(Number) }).from(objects).where(where).orderBy(orderBy, asc(objects.id)).limit(limit).offset(offset),
      this.db.select({ n: sql`count(*)::int`.mapWith(Number) }).from(objects).where(where),
    ]);
    return { items: items.map((r) => ({ ...r.object, fieldCount: r.fieldCount })), total: total.n };
  }
  async findObject(tenantId, id) { return first(await this.db.select().from(objects).where(and(eq(objects.tenantId, tenantId), eq(objects.id, id))).limit(1)); }
  async findObjectByKey(tenantId, key) { return first(await this.db.select().from(objects).where(and(eq(objects.tenantId, tenantId), sql`lower(${objects.key}) = ${key.toLowerCase()}`)).limit(1)); }
  async keysOf(tenantId) { return (await this.db.select({ key: objects.key }).from(objects).where(eq(objects.tenantId, tenantId))).map((r) => r.key); }
  async createObject(values) { return first(await this.db.insert(objects).values(values).returning()); }
  async updateObject(tenantId, id, values) { return first(await this.db.update(objects).set(values).where(and(eq(objects.tenantId, tenantId), eq(objects.id, id))).returning()); }

  // ------------------------------------------------------------------------------------------------ fields

  async listFields(tenantId, objectId, { q = '', type, types, flag, sort = 'order', order = 'asc', limit = 200, offset = 0 } = {}) {
    const where = and(
      eq(fields.tenantId, tenantId), eq(fields.objectId, objectId),
      q ? sql`(lower(${fields.label}) like ${like(q)} escape '\\' or lower(${fields.key}) like ${like(q)} escape '\\')` : sql`true`,
      type ? eq(fields.type, type) : types?.length ? sql`${fields.type} = any(${pgArray(types, 'text')})` : sql`true`,
      flag === 'required' ? eq(fields.required, true) : flag === 'unique' ? eq(fields.isUnique, true) : flag === 'encrypted' ? eq(fields.encrypted, true) : flag === 'indexed' ? eq(fields.indexed, true) : sql`true`,
    );
    const orderBy = sort === 'label' ? dir(order, sql`lower(${fields.label})`) : sort === 'key' ? dir(order, sql`lower(${fields.key})`) : sort === 'type' ? dir(order, fields.type) : sort === 'updated' ? dir(order, fields.updatedAt) : dir(order, fields.sortOrder);
    const [items, [total]] = await Promise.all([
      this.db.select().from(fields).where(where).orderBy(orderBy, asc(fields.id)).limit(limit).offset(offset),
      this.db.select({ n: sql`count(*)::int`.mapWith(Number) }).from(fields).where(where),
    ]);
    return { items, total: total.n };
  }
  async allFields(tenantId, objectId) { return this.db.select().from(fields).where(and(eq(fields.tenantId, tenantId), eq(fields.objectId, objectId))).orderBy(asc(fields.sortOrder), asc(fields.id)).limit(1000); }
  async findField(tenantId, objectId, id) { return first(await this.db.select().from(fields).where(and(eq(fields.tenantId, tenantId), eq(fields.objectId, objectId), eq(fields.id, id))).limit(1)); }
  async nextSortOrder(objectId) { const [r] = await this.db.select({ n: sql`coalesce(max(${fields.sortOrder}), 0) + 10`.mapWith(Number) }).from(fields).where(eq(fields.objectId, objectId)); return r.n; }
  async createField(values) { return first(await this.db.insert(fields).values(values).returning()); }
  async updateField(tenantId, objectId, id, values) { return first(await this.db.update(fields).set(values).where(and(eq(fields.tenantId, tenantId), eq(fields.objectId, objectId), eq(fields.id, id))).returning()); }
  async deleteField(tenantId, objectId, id) { return (await this.db.delete(fields).where(and(eq(fields.tenantId, tenantId), eq(fields.objectId, objectId), eq(fields.id, id))).returning({ id: fields.id })).length === 1; }
  async setOrder(tenantId, objectId, ids) {
    for (const [i, id] of ids.entries()) await this.db.update(fields).set({ sortOrder: (i + 1) * 10 }).where(and(eq(fields.tenantId, tenantId), eq(fields.objectId, objectId), eq(fields.id, id)));
  }

  /** Other fields (any object of the tenant) whose settings mention this object's field, e.g. a line-item column or a roll-up. Returns their labels. */
  async fieldsMentioning(tenantId, objectKey, fieldKey, exceptObjectId) {
    const rows = await this.db.execute(sql`select label from fields where tenant_id = ${tenantId} and object_id <> ${exceptObjectId} and type in ('line_items', 'rollup')
      and (settings->>'lineObject' = ${objectKey} or settings->>'child' = ${objectKey}) and settings::text ilike ${`%"${fieldKey}"%`} limit 10`);
    return rows.rows.map((r) => r.label);
  }

  /** The profile and permission sets of a person (names), for evaluating rules "as" them. */
  async personAccess(tenantId, userId) {
    const rows = await this.db.execute(sql`select
      (select p.name from memberships m join profiles p on p.id = m.profile_id where m.tenant_id = ${tenantId} and m.user_id = ${userId}) as profile,
      coalesce((select array_agg(s.name) from permission_set_assignments a join permission_sets s on s.id = a.permission_set_id where a.tenant_id = ${tenantId} and a.user_id = ${userId}), '{}') as permission_sets`);
    return { profile: rows.rows[0]?.profile ?? null, permissionSets: rows.rows[0]?.permission_sets ?? [] };
  }

  // ------------------------------------------------------------------------------------------------ pickers (server-side search)

  /** People a User field may offer, filtered by the field's settings, the workspace and a search term. */
  async searchPeople(tenantId, workspaceId, filter, q, limit) {
    const f = filter ?? {};
    const parts = [sql`m.tenant_id = ${tenantId}`];
    if (f.activeOnly !== false) parts.push(sql`u.status = 'active'`);
    if (f.workspace !== 'any' && workspaceId) parts.push(sql`exists (select 1 from workspace_assignments wa where wa.tenant_id = m.tenant_id and wa.user_id = m.user_id and wa.workspace_id = ${workspaceId})`);
    if (f.profiles?.length) parts.push(sql`m.profile_id in (select id from profiles where tenant_id = ${tenantId} and name = any(${pgArray(f.profiles, 'text')}))`);
    if (f.orgRoles?.length) parts.push(sql`m.role::text = any(${pgArray(f.orgRoles, 'text')})`);
    if (f.permissionSets?.length) parts.push(sql`exists (select 1 from permission_set_assignments a join permission_sets s on s.id = a.permission_set_id where a.user_id = m.user_id and a.tenant_id = m.tenant_id and s.name = any(${pgArray(f.permissionSets, 'text')}))`);
    if (f.hierarchyRoles?.length) {
      const names = pgArray(f.hierarchyRoles, 'text');
      parts.push(f.includeSubtree === false
        ? sql`m.hierarchy_role_id in (select id from hierarchy_roles where tenant_id = ${tenantId} and name = any(${names}))`
        : sql`exists (select 1 from hierarchy_roles r join hierarchy_roles top on top.tenant_id = r.tenant_id and top.name = any(${names}) and r.path like top.path || '%' where r.id = m.hierarchy_role_id and r.tenant_id = ${tenantId})`);
    }
    if (q) parts.push(sql`(lower(u.first_name || ' ' || u.last_name) like ${like(q)} escape '\\' or lower(u.email) like ${like(q)} escape '\\')`);
    const rows = await this.db.execute(sql`select u.id, u.first_name, u.last_name, u.email, m.role::text as role, p.name as profile
      from memberships m join users u on u.id = m.user_id left join profiles p on p.id = m.profile_id
      where ${sql.join(parts, sql` and `)} order by lower(u.first_name), lower(u.last_name), u.id limit ${limit}`);
    return rows.rows.map((r) => ({ value: r.id, label: `${r.first_name} ${r.last_name}`.trim() || r.email, description: r.email, meta: [r.profile, r.role].filter(Boolean).join(' · ') }));
  }
}
