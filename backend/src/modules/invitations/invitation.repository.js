import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { invitations, users, workspaces } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class InvitationRepository {
  constructor(db) { this.db = db; }

  async create(values) { return first(await this.db.insert(invitations).values(values).returning()); }

  async findById(id) {
    return first(
      await this.db.select({
        id: invitations.id, workspaceId: invitations.workspaceId, email: invitations.email, role: invitations.role,
        tokenHash: invitations.tokenHash, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, revokedAt: invitations.revokedAt,
        workspaceName: workspaces.name, invitedBy: invitations.invitedBy,
      }).from(invitations).innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId)).where(eq(invitations.id, id)).limit(1),
    );
  }

  async findPending(workspaceId, email) {
    return first(await this.db.select().from(invitations)
      .where(and(eq(invitations.workspaceId, workspaceId), eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt))).limit(1));
  }

  listPending(workspaceId) {
    return this.db.select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
      .from(invitations).where(and(eq(invitations.workspaceId, workspaceId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .orderBy(desc(invitations.createdAt)).limit(100);
  }

  /** Atomic single use. */
  async markAccepted(id) {
    return (await this.db.update(invitations).set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), sql`${invitations.expiresAt} > now()`)).returning({ id: invitations.id })).length === 1;
  }

  async revoke(id, workspaceId) {
    return (await this.db.update(invitations).set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, id), eq(invitations.workspaceId, workspaceId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt))).returning({ id: invitations.id })).length === 1;
  }

  async reissue(id, { tokenHash, expiresAt }) {
    return first(await this.db.update(invitations).set({ tokenHash, expiresAt }).where(eq(invitations.id, id)).returning());
  }

  async inviterName(userId) {
    if (!userId) return null;
    const row = first(await this.db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, userId)).limit(1));
    return row ? `${row.f} ${row.l}` : null;
  }

  async deleteExpired(batchSize) {
    const stale = this.db.select({ id: invitations.id }).from(invitations).where(sql`${invitations.expiresAt} < now() - interval '30 days'`).limit(batchSize);
    return (await this.db.delete(invitations).where(inArray(invitations.id, stale)).returning({ id: invitations.id })).length;
  }
}
