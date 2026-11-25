import { and, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { sessions } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class SessionRepository {
  constructor(db) { this.db = db; }

  async create(values) { return first(await this.db.insert(sessions).values(values).returning()); }
  async findById(id) { return first(await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1)); }

  /** Compare-and-swap rotation: succeeds only if the presented hash is still the current one. */
  async rotate(id, { expectedHash, newHash, expiresAt }) {
    return first(
      await this.db.update(sessions)
        .set({ prevRefreshHash: expectedHash, refreshHash: newHash, lastUsedAt: new Date(), expiresAt })
        .where(and(eq(sessions.id, id), eq(sessions.refreshHash, expectedHash), isNull(sessions.revokedAt)))
        .returning(),
    );
  }

  setTenant(id, tenantId, workspaceId = null) { return this.db.update(sessions).set({ tenantId, workspaceId }).where(eq(sessions.id, id)); }
  setWorkspace(id, workspaceId) { return this.db.update(sessions).set({ workspaceId }).where(eq(sessions.id, id)); }

  listActive(userId) {
    return this.db.select({
      id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastUsedAt: sessions.lastUsedAt,
    }).from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), sql`${sessions.expiresAt} > now()`))
      .orderBy(sql`${sessions.lastUsedAt} desc`).limit(50);
  }

  async revoke(id, userId, reason) {
    const rows = await this.db.update(sessions).set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.revokedAt))).returning({ id: sessions.id });
    return rows.length === 1;
  }

  revokeAllForUser(userId, reason, exceptSessionId) {
    const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
    if (exceptSessionId) conditions.push(ne(sessions.id, exceptSessionId));
    return this.db.update(sessions).set({ revokedAt: new Date(), revokedReason: reason }).where(and(...conditions));
  }

  async deleteExpired(batchSize) {
    const stale = this.db.select({ id: sessions.id }).from(sessions)
      .where(sql`${sessions.expiresAt} < now() - interval '1 day' or ${sessions.revokedAt} < now() - interval '30 days'`).limit(batchSize);
    return (await this.db.delete(sessions).where(inArray(sessions.id, stale)).returning({ id: sessions.id })).length;
  }
}
