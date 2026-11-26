import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { users, workspaceAssignments, workspaces } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class WorkspaceRepository {
  constructor(db) { this.db = db; }

  list(tenantId, { archived = false } = {}) {
    return this.db.select({
      id: workspaces.id, name: workspaces.name, slug: workspaces.slug, isDefault: workspaces.isDefault, archivedAt: workspaces.archivedAt, createdAt: workspaces.createdAt,
      members: sql`(select count(*)::int from ${workspaceAssignments} a where a.workspace_id = ${workspaces.id})`.mapWith(Number),
    }).from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), archived ? sql`true` : isNull(workspaces.archivedAt)))
      .orderBy(sql`${workspaces.isDefault} desc`, asc(workspaces.name)).limit(200);
  }

  async find(tenantId, id) {
    return first(await this.db.select().from(workspaces).where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.id, id))).limit(1));
  }
  async defaultOf(tenantId) {
    return first(await this.db.select().from(workspaces).where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isDefault, true))).limit(1));
  }
  async slugExists(tenantId, slug) {
    return Boolean(first(await this.db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.slug, slug))).limit(1)));
  }
  async create(values) { return first(await this.db.insert(workspaces).values(values).returning()); }
  async update(tenantId, id, values) {
    return first(await this.db.update(workspaces).set(values).where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.id, id))).returning());
  }

  /** Workspaces the person may use (assigned and not archived), their default first. */
  forUser(tenantId, userId) {
    return this.db.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, isTenantDefault: workspaces.isDefault, isDefault: workspaceAssignments.isDefault })
      .from(workspaceAssignments)
      .innerJoin(workspaces, eq(workspaces.id, workspaceAssignments.workspaceId))
      .where(and(eq(workspaceAssignments.tenantId, tenantId), eq(workspaceAssignments.userId, userId), isNull(workspaces.archivedAt)))
      .orderBy(sql`${workspaceAssignments.isDefault} desc`, asc(workspaces.name)).limit(200);
  }

  async assignment(tenantId, workspaceId, userId) {
    return first(await this.db.select().from(workspaceAssignments)
      .where(and(eq(workspaceAssignments.tenantId, tenantId), eq(workspaceAssignments.workspaceId, workspaceId), eq(workspaceAssignments.userId, userId))).limit(1));
  }

  /** Is the person assigned to this workspace, and is it still live? */
  async isActiveFor(tenantId, workspaceId, userId) {
    const [row] = await this.db.select({ id: workspaceAssignments.workspaceId }).from(workspaceAssignments)
      .innerJoin(workspaces, eq(workspaces.id, workspaceAssignments.workspaceId))
      .where(and(eq(workspaceAssignments.tenantId, tenantId), eq(workspaceAssignments.workspaceId, workspaceId), eq(workspaceAssignments.userId, userId), isNull(workspaces.archivedAt))).limit(1);
    return Boolean(row);
  }

  /** Assigns the person; the first workspace they get becomes their default. Idempotent. */
  async assign(tenantId, workspaceId, userId) {
    await this.db.execute(sql`
      insert into workspace_assignments (tenant_id, workspace_id, user_id, is_default)
      values (${tenantId}, ${workspaceId}, ${userId}, not exists (select 1 from workspace_assignments where tenant_id = ${tenantId} and user_id = ${userId}))
      on conflict do nothing`);
  }

  async countForUser(tenantId, userId) {
    const [row] = await this.db.select({ n: sql`count(*)::int` }).from(workspaceAssignments).where(and(eq(workspaceAssignments.tenantId, tenantId), eq(workspaceAssignments.userId, userId)));
    return row.n;
  }

  /** Removes the assignment; when it was the person's default, another one (oldest) takes over. */
  async unassign(tenantId, workspaceId, userId) {
    const removed = await this.db.delete(workspaceAssignments)
      .where(and(eq(workspaceAssignments.tenantId, tenantId), eq(workspaceAssignments.workspaceId, workspaceId), eq(workspaceAssignments.userId, userId))).returning();
    if (removed[0]?.isDefault) await this.#promoteDefault(tenantId, userId);
    return removed.length === 1;
  }

  async setDefault(tenantId, workspaceId, userId) {
    await this.db.execute(sql`update workspace_assignments set is_default = false where tenant_id = ${tenantId} and user_id = ${userId} and is_default`);
    await this.db.execute(sql`update workspace_assignments set is_default = true where tenant_id = ${tenantId} and user_id = ${userId} and workspace_id = ${workspaceId}`);
  }

  async #promoteDefault(tenantId, userId) {
    await this.db.execute(sql`
      update workspace_assignments set is_default = true
      where (workspace_id, user_id) = (select a.workspace_id, a.user_id from workspace_assignments a join workspaces w on w.id = a.workspace_id
        where a.tenant_id = ${tenantId} and a.user_id = ${userId} and w.archived_at is null order by a.created_at limit 1)`);
  }

  /** People assigned to a workspace (for the admin screen). */
  members(tenantId, workspaceId) {
    return this.db.select({ userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, isDefault: workspaceAssignments.isDefault })
      .from(workspaceAssignments).innerJoin(users, eq(users.id, workspaceAssignments.userId))
      .where(and(eq(workspaceAssignments.tenantId, tenantId), eq(workspaceAssignments.workspaceId, workspaceId)))
      .orderBy(asc(users.firstName), asc(users.email)).limit(500);
  }

  /** Workspaces (ids) a person is assigned to, for admin screens. */
  async idsFor(tenantId, userId) {
    const rows = await this.db.select({ id: workspaceAssignments.workspaceId }).from(workspaceAssignments).where(and(eq(workspaceAssignments.tenantId, tenantId), eq(workspaceAssignments.userId, userId)));
    return rows.map((r) => r.id);
  }

  /** Archiving removes it from every switcher; assignments are kept so un-archiving restores them. People left without any live workspace fall back to the default one. */
  async archive(tenantId, id) {
    return first(await this.db.update(workspaces).set({ archivedAt: new Date() }).where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.id, id), eq(workspaces.isDefault, false), isNull(workspaces.archivedAt))).returning());
  }
  async restore(tenantId, id) {
    return first(await this.db.update(workspaces).set({ archivedAt: null }).where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.id, id))).returning());
  }
}
