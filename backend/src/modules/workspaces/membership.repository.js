import { and, asc, eq, sql } from 'drizzle-orm';
import { memberships, users, workspaces } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class MembershipRepository {
  constructor(db) { this.db = db; }

  /** Idempotent insert — safe under concurrent invitation acceptance. */
  async add({ workspaceId, userId, role }) {
    return first(await this.db.insert(memberships).values({ workspaceId, userId, role }).onConflictDoNothing().returning());
  }

  async find(workspaceId, userId) {
    return first(await this.db.select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).limit(1));
  }

  listWorkspacesForUser(userId) {
    return this.db.select({
      id: workspaces.id, name: workspaces.name, slug: workspaces.slug, theme: workspaces.theme, role: memberships.role,
      onboarded: sql`${workspaces.onboardedAt} is not null`.mapWith(Boolean), joinedAt: memberships.createdAt,
    }).from(memberships).innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(eq(memberships.userId, userId)).orderBy(asc(memberships.createdAt)).limit(100);
  }

  /** Keyset pagination on (created_at, user_id) — O(limit) regardless of workspace size. */
  listMembers(workspaceId, { limit, after }) {
    const cursor = after ? sql`and (${memberships.createdAt}, ${memberships.userId}) > (${after.createdAt}::timestamptz, ${after.userId}::uuid)` : sql``;
    return this.db.select({
      userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
      role: memberships.role, profile: memberships.profile, joinedAt: memberships.createdAt,
      cursorTs: sql`${memberships.createdAt}::text`, // full microsecond precision, so keyset paging never repeats a row
    }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(sql`${memberships.workspaceId} = ${workspaceId} ${cursor}`)
      .orderBy(asc(memberships.createdAt), asc(memberships.userId)).limit(limit);
  }

  async updateRole(workspaceId, userId, role) {
    return first(await this.db.update(memberships).set({ role }).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).returning());
  }

  async setProfile(workspaceId, userId, profile) {
    return first(await this.db.update(memberships).set({ profile }).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).returning());
  }

  async remove(workspaceId, userId) {
    return (await this.db.delete(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).returning({ id: memberships.userId })).length === 1;
  }

  async countMembers(workspaceId) {
    const [row] = await this.db.select({ n: sql`count(*)::int` }).from(memberships).where(eq(memberships.workspaceId, workspaceId));
    return row.n;
  }

  async countOwners(workspaceId) {
    const [row] = await this.db.select({ n: sql`count(*)::int` }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, 'owner')));
    return row.n;
  }
}
