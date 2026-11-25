import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';
import { v7 as uuidv7 } from 'uuid';

/**
 * The role hierarchy: one tree per tenant, stored as parent links plus a materialised path ("/root/child/leaf/") and a depth.
 * "Everything below X" is a prefix scan on `path`; moving a node rewrites only the paths below it.
 */
export class HierarchyRepository {
  constructor(db) { this.db = db; }

  async #rows(query) { return (await this.db.execute(query)).rows; }

  /** Every role of a tenant (capped) with the people assigned to it, in tree order. */
  list(tenantId) {
    return this.#rows(sql`
      select r.id, r.parent_id, r.name, r.description, r.path, r.depth,
        coalesce((select string_agg(nullif(trim(concat(u.first_name, ' ', u.last_name)), ''), ', ' order by u.first_name, u.last_name) from memberships m join users u on u.id = m.user_id where m.hierarchy_role_id = r.id), '') as assigned_to
      from hierarchy_roles r where r.tenant_id = ${tenantId} order by r.path limit 5000`);
  }
  async byId(tenantId, id) { return (await this.#rows(sql`select * from hierarchy_roles where tenant_id = ${tenantId} and id = ${id}::uuid`))[0] ?? null; }
  async root(tenantId) { return (await this.#rows(sql`select * from hierarchy_roles where tenant_id = ${tenantId} and parent_id is null`))[0] ?? null; }
  /** The top of the hierarchy is the tenant itself, so it carries the tenant's name. */
  async renameRoot(tenantId, name) { await this.db.execute(sql`update hierarchy_roles set name = ${name} where tenant_id = ${tenantId} and parent_id is null`); }
  async byName(tenantId, name) { return (await this.#rows(sql`select * from hierarchy_roles where tenant_id = ${tenantId} and lower(name) = lower(${name}) order by depth limit 1`))[0] ?? null; }

  async create(tenantId, { parentId, name, description = '' }) {
    const parent = await this.byId(tenantId, parentId);
    if (!parent) return null;
    const id = uuidv7();
    return (await this.#rows(sql`
      insert into hierarchy_roles (id, tenant_id, parent_id, name, description, path, depth)
      values (${id}::uuid, ${tenantId}, ${parent.id}::uuid, ${name}, ${description}, ${`${parent.path}${id}/`}, ${parent.depth + 1}) returning *`))[0];
  }
  async update(tenantId, id, { name, description }) {
    return (await this.#rows(sql`update hierarchy_roles set name = coalesce(${name ?? null}, name), description = coalesce(${description ?? null}, description) where tenant_id = ${tenantId} and id = ${id}::uuid returning *`))[0] ?? null;
  }
  /** Moves a node (and everything under it) below another node. The caller has already refused a move into its own subtree. */
  async move(tenantId, node, parent) {
    const oldPrefix = node.path; const newPrefix = `${parent.path}${node.id}/`; const delta = parent.depth + 1 - node.depth;
    await this.db.execute(sql`
      update hierarchy_roles set path = ${newPrefix} || substr(path, ${oldPrefix.length + 1}), depth = depth + ${delta}
      where tenant_id = ${tenantId} and path like ${`${oldPrefix.replace(/[\\%_]/g, '\\$&')}%`}`);
    await this.db.execute(sql`update hierarchy_roles set parent_id = ${parent.id}::uuid where tenant_id = ${tenantId} and id = ${node.id}::uuid`);
  }
  async hasChildren(tenantId, ids) { return (await this.#rows(sql`select 1 from hierarchy_roles where tenant_id = ${tenantId} and parent_id = any(${pgArray(ids, "uuid")}) limit 1`)).length > 0; }
  async remove(tenantId, ids) { return (await this.db.execute(sql`delete from hierarchy_roles where tenant_id = ${tenantId} and id = any(${pgArray(ids, "uuid")}) and parent_id is not null`)).rowCount; }
  async countRoles(tenantId) { return (await this.#rows(sql`select count(*)::int as n from hierarchy_roles where tenant_id = ${tenantId}`))[0].n; }
  async assignMember(tenantId, userId, roleId) {
    return (await this.db.execute(sql`update memberships set hierarchy_role_id = ${roleId}::uuid where tenant_id = ${tenantId} and user_id = ${userId}::uuid`)).rowCount;
  }
}
