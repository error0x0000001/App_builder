import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';

const like = (q) => `%${String(q).toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
const FLAGS = ['can_read', 'can_create', 'can_edit', 'can_delete'];

/** The standard profiles and what each may do with every object. They define what the profiles mean, so every tenant has them. */
export const SYSTEM_PROFILES = Object.freeze([
  { name: 'System Administrator', description: 'Administrator profile', read: true, create: true, edit: true, delete: true },
  { name: 'Standard User', description: 'Standard profile for everyday work', read: true, create: true, edit: true, delete: false },
  { name: 'Read Only', description: 'Can see records but not change them', read: true, create: false, edit: false, delete: false },
  { name: 'Minimum Access - API Only', description: 'No access to the app; for integrations', read: false, create: false, edit: false, delete: false },
]);

/** Profiles, permission sets, their grants, assignments and sharing defaults. Every method is scoped by tenant. */
export class AccessRepository {
  constructor(db) { this.db = db; }

  async #rows(query) { return (await this.db.execute(query)).rows; }

  // ---------------------------------------------------------------- profiles
  listProfiles(tenantId, { limit, after, q } = {}) {
    return this.#rows(sql`
      select p.id, p.name, p.description, p.user_license, p.is_system, p.created_at, p.updated_at,
        nullif(trim(concat(u.first_name, ' ', u.last_name)), '') as created_by_name
      from profiles p left join users u on u.id = p.created_by
      where p.tenant_id = ${tenantId} ${q ? sql`and lower(p.name) like ${like(q)}` : sql``}
        ${after ? sql`and (lower(p.name), p.id) > (${after.n}, ${after.id}::uuid)` : sql``}
      order by lower(p.name), p.id limit ${limit}`);
  }
  async profileByName(tenantId, name) { return (await this.#rows(sql`select * from profiles where tenant_id = ${tenantId} and lower(name) = lower(${name})`))[0] ?? null; }
  async profileById(tenantId, id) { return (await this.#rows(sql`select * from profiles where tenant_id = ${tenantId} and id = ${id}::uuid`))[0] ?? null; }
  async createProfile(tenantId, { name, description = '', userLicense = 'Quelli', createdBy = null }) {
    return (await this.#rows(sql`insert into profiles (tenant_id, name, description, user_license, created_by) values (${tenantId}, ${name}, ${description}, ${userLicense}, ${createdBy}) returning *`))[0];
  }
  async updateProfile(tenantId, id, { name, description }) {
    return (await this.#rows(sql`update profiles set name = coalesce(${name ?? null}, name), description = coalesce(${description ?? null}, description), updated_at = now() where tenant_id = ${tenantId} and id = ${id}::uuid and not is_system returning *`))[0] ?? null;
  }
  /** Removes custom profiles only; the people who had one fall back to their role's defaults. Returns how many went. */
  async deleteProfiles(tenantId, ids) {
    return (await this.db.execute(sql`delete from profiles where tenant_id = ${tenantId} and id = any(${pgArray(ids, 'uuid')}) and not is_system`)).rowCount;
  }
  async countProfiles(tenantId) { return (await this.#rows(sql`select count(*)::int as n from profiles where tenant_id = ${tenantId}`))[0].n; }

  // ---------------------------------------------------------------- permission sets
  listPermissionSets(tenantId) {
    return this.#rows(sql`
      select s.id, s.name, s.description, s.created_at, (select count(*)::int from permission_set_assignments a where a.permission_set_id = s.id) as users
      from permission_sets s where s.tenant_id = ${tenantId} order by lower(s.name), s.id limit 5000`);
  }
  async permissionSetByName(tenantId, name) { return (await this.#rows(sql`select * from permission_sets where tenant_id = ${tenantId} and lower(name) = lower(${name})`))[0] ?? null; }
  async createPermissionSet(tenantId, { name, description = '', createdBy = null }) {
    return (await this.#rows(sql`insert into permission_sets (tenant_id, name, description, created_by) values (${tenantId}, ${name}, ${description}, ${createdBy}) returning *`))[0];
  }
  async countPermissionSets(tenantId) { return (await this.#rows(sql`select count(*)::int as n from permission_sets where tenant_id = ${tenantId}`))[0].n; }

  // ---------------------------------------------------------------- grants (object permissions)
  listGrants(tenantId, { limit, after, q } = {}) {
    return this.#rows(sql`
      select g.id, g.object_key, g.can_read, g.can_create, g.can_edit, g.can_delete, g.created_at, coalesce(p.name, s.name) as grantee, (g.profile_id is not null) as is_profile
      from object_permissions g left join profiles p on p.id = g.profile_id left join permission_sets s on s.id = g.permission_set_id
      where g.tenant_id = ${tenantId} ${q ? sql`and (lower(g.object_key) like ${like(q)} or lower(coalesce(p.name, s.name)) like ${like(q)})` : sql``}
        ${after ? sql`and (g.created_at, g.id) < (${after.t}::timestamptz, ${after.id}::uuid)` : sql``}
      order by g.created_at desc, g.id desc limit ${limit}`);
  }
  /** Sets (or replaces) one grantee's permissions on one object. `grantee` is { profileId } or { permissionSetId }. */
  async upsertGrant(tenantId, grantee, objectKey, flags) {
    const [read, create, edit, del] = FLAGS.map((f) => Boolean(flags[f]));
    const profileId = grantee.profileId ?? null; const setId = grantee.permissionSetId ?? null;
    const conflict = profileId ? sql`(profile_id, object_key) where profile_id is not null` : sql`(permission_set_id, object_key) where permission_set_id is not null`;
    return (await this.#rows(sql`
      insert into object_permissions (tenant_id, profile_id, permission_set_id, object_key, can_read, can_create, can_edit, can_delete)
      values (${tenantId}, ${profileId}::uuid, ${setId}::uuid, ${objectKey}, ${read}, ${create}, ${edit}, ${del})
      on conflict ${conflict} do update set can_read = excluded.can_read, can_create = excluded.can_create, can_edit = excluded.can_edit, can_delete = excluded.can_delete, updated_at = now()
      returning id`))[0];
  }
  async updateGrant(tenantId, id, flags) {
    const f = Object.fromEntries(FLAGS.map((k) => [k, flags[k] ?? null]));
    return (await this.#rows(sql`update object_permissions set can_read = coalesce(${f.can_read}, can_read), can_create = coalesce(${f.can_create}, can_create), can_edit = coalesce(${f.can_edit}, can_edit), can_delete = coalesce(${f.can_delete}, can_delete), updated_at = now() where tenant_id = ${tenantId} and id = ${id}::uuid returning id`))[0] ?? null;
  }
  async deleteGrants(tenantId, ids) { return (await this.db.execute(sql`delete from object_permissions where tenant_id = ${tenantId} and id = any(${pgArray(ids, 'uuid')})`)).rowCount; }
  /** Everything the access check needs for a tenant, in one read (the service caches it). */
  allGrants(tenantId) {
    return this.#rows(sql`select profile_id, permission_set_id, object_key, can_read, can_create, can_edit, can_delete from object_permissions where tenant_id = ${tenantId}`);
  }

  // ---------------------------------------------------------------- assignments (permission sets on a person)
  assignedSetIds(tenantId, userId) {
    return this.#rows(sql`select permission_set_id from permission_set_assignments where tenant_id = ${tenantId} and user_id = ${userId}::uuid`).then((rows) => rows.map((r) => r.permission_set_id));
  }
  setsOfUser(tenantId, userId) {
    return this.#rows(sql`select s.id, s.name, a.created_at as "assignedAt" from permission_set_assignments a join permission_sets s on s.id = a.permission_set_id where a.tenant_id = ${tenantId} and a.user_id = ${userId}::uuid order by lower(s.name)`);
  }
  listAssignments(tenantId, { limit, after, q } = {}) {
    return this.#rows(sql`
      select a.id, a.permission_set_id, a.user_id, a.created_at, s.name as permission_set, nullif(trim(concat(u.first_name, ' ', u.last_name)), '') as user_name, u.email
      from permission_set_assignments a join permission_sets s on s.id = a.permission_set_id join users u on u.id = a.user_id
      where a.tenant_id = ${tenantId} ${q ? sql`and (lower(s.name) like ${like(q)} or lower(u.email) like ${like(q)} or lower(concat(u.first_name, ' ', u.last_name)) like ${like(q)})` : sql``}
        ${after ? sql`and (a.created_at, a.id) < (${after.t}::timestamptz, ${after.id}::uuid)` : sql``}
      order by a.created_at desc, a.id desc limit ${limit}`);
  }
  assignmentsByIds(tenantId, ids) {
    return this.#rows(sql`select a.id, a.user_id, s.name as permission_set from permission_set_assignments a join permission_sets s on s.id = a.permission_set_id where a.tenant_id = ${tenantId} and a.id = any(${pgArray(ids, 'uuid')})`);
  }
  async memberByEmail(tenantId, email) {
    return (await this.#rows(sql`select u.id from memberships m join users u on u.id = m.user_id where m.tenant_id = ${tenantId} and lower(u.email) = lower(${email})`))[0] ?? null;
  }
  async assign(tenantId, permissionSetId, userId, assignedBy) {
    return (await this.db.execute(sql`insert into permission_set_assignments (tenant_id, permission_set_id, user_id, assigned_by) values (${tenantId}, ${permissionSetId}::uuid, ${userId}::uuid, ${assignedBy}) on conflict do nothing`)).rowCount;
  }
  async unassign(tenantId, permissionSetId, userId) {
    return (await this.db.execute(sql`delete from permission_set_assignments where tenant_id = ${tenantId} and permission_set_id = ${permissionSetId}::uuid and user_id = ${userId}::uuid`)).rowCount;
  }

  // ---------------------------------------------------------------- sharing defaults
  sharingOverrides(tenantId) { return this.#rows(sql`select object_key, internal_access, external_access, grant_via_hierarchies from sharing_defaults where tenant_id = ${tenantId}`); }
  async upsertSharing(tenantId, objectKey, { internalAccess, externalAccess, grantViaHierarchies }) {
    await this.db.execute(sql`
      insert into sharing_defaults (tenant_id, object_key, internal_access, external_access, grant_via_hierarchies)
      values (${tenantId}, ${objectKey}, coalesce(${internalAccess ?? null}, 'Public Read/Write'), coalesce(${externalAccess ?? null}, 'Private'), coalesce(${grantViaHierarchies ?? null}::boolean, true))
      on conflict (tenant_id, object_key) do update set internal_access = coalesce(${internalAccess ?? null}, sharing_defaults.internal_access), external_access = coalesce(${externalAccess ?? null}, sharing_defaults.external_access),
        grant_via_hierarchies = coalesce(${grantViaHierarchies ?? null}::boolean, sharing_defaults.grant_via_hierarchies), updated_at = now()`);
  }

  // ---------------------------------------------------------------- a new tenant
  /** What every tenant starts with: the standard profiles and their grants, the top node of the role hierarchy and the default security policies. */
  async provision(tenantId, tenantName) {
    for (const p of SYSTEM_PROFILES) {
      const row = (await this.#rows(sql`insert into profiles (tenant_id, name, description, is_system) values (${tenantId}, ${p.name}, ${p.description}, true) on conflict do nothing returning id`))[0];
      if (!row) continue;
      await this.db.execute(sql`insert into object_permissions (tenant_id, profile_id, object_key, can_read, can_create, can_edit, can_delete) values (${tenantId}, ${row.id}::uuid, 'All', ${p.read}, ${p.create}, ${p.edit}, ${p.delete}) on conflict do nothing`);
    }
    const root = (await this.#rows(sql`insert into hierarchy_roles (tenant_id, name, path, depth) values (${tenantId}, ${tenantName}, '', 0) on conflict do nothing returning id`))[0];
    if (root) await this.db.execute(sql`update hierarchy_roles set path = '/' || id::text || '/' where id = ${root.id}::uuid`);
    await this.db.execute(sql`insert into password_policies (tenant_id) values (${tenantId}) on conflict do nothing`);
    await this.db.execute(sql`insert into session_policies (tenant_id) values (${tenantId}) on conflict do nothing`);
    await this.db.execute(sql`insert into login_policies (tenant_id) values (${tenantId}) on conflict do nothing`);
  }
}
