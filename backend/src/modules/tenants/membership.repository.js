import { and, asc, eq, sql } from 'drizzle-orm';
import { memberships, users, tenants } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class MembershipRepository {
  constructor(db) { this.db = db; }

  /** Idempotent insert — safe under concurrent invitation acceptance. */
  async add({ tenantId, userId, role }) {
    return first(await this.db.insert(memberships).values({ tenantId, userId, role }).onConflictDoNothing().returning());
  }

  async find(tenantId, userId) {
    return first(await this.db.select().from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId))).limit(1));
  }

  listTenantsForUser(userId) {
    return this.db.select({
      id: tenants.id, name: tenants.name, slug: tenants.slug, theme: tenants.theme, uiSettings: tenants.uiSettings, role: memberships.role,
      onboarded: sql`${tenants.onboardedAt} is not null`.mapWith(Boolean), joinedAt: memberships.createdAt,
    }).from(memberships).innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, userId)).orderBy(asc(memberships.createdAt)).limit(100);
  }

  /** Keyset pagination on (created_at, user_id) — O(limit) regardless of tenant size. */
  listMembers(tenantId, { limit, after }) {
    const cursor = after ? sql`and (${memberships.createdAt}, ${memberships.userId}) > (${after.createdAt}::timestamptz, ${after.userId}::uuid)` : sql``;
    return this.db.select({
      userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
      role: memberships.role, profile: memberships.profile, joinedAt: memberships.createdAt,
      cursorTs: sql`${memberships.createdAt}::text`, // full microsecond precision, so keyset paging never repeats a row
    }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(sql`${memberships.tenantId} = ${tenantId} ${cursor}`)
      .orderBy(asc(memberships.createdAt), asc(memberships.userId)).limit(limit);
  }

  async updateRole(tenantId, userId, role) {
    return first(await this.db.update(memberships).set({ role }).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId))).returning());
  }

  async setProfile(tenantId, userId, profile) {
    return first(await this.db.update(memberships).set({ profile }).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId))).returning());
  }

  async remove(tenantId, userId) {
    return (await this.db.delete(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId))).returning({ id: memberships.userId })).length === 1;
  }

  async countMembers(tenantId) {
    const [row] = await this.db.select({ n: sql`count(*)::int` }).from(memberships).where(eq(memberships.tenantId, tenantId));
    return row.n;
  }

  async countOwners(tenantId) {
    const [row] = await this.db.select({ n: sql`count(*)::int` }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, 'owner')));
    return row.n;
  }
}
