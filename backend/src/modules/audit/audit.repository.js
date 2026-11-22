import { desc, eq, lt, and, sql } from 'drizzle-orm';
import { authEvents } from '../../shared/db/schema/index.js';

export class AuditRepository {
  constructor(db) { this.db = db; }

  record(event) { return this.db.insert(authEvents).values(event); }

  /** Keyset pagination on the time-ordered UUIDv7 primary key. */
  listForUser(userId, { limit, after }) {
    const conditions = [eq(authEvents.userId, userId)];
    if (after) conditions.push(lt(authEvents.id, after));
    return this.db.select({ id: authEvents.id, type: authEvents.type, ip: authEvents.ip, userAgent: authEvents.userAgent, createdAt: authEvents.createdAt })
      .from(authEvents).where(and(...conditions)).orderBy(desc(authEvents.id)).limit(limit);
  }

  async deleteOlderThan(days, batchSize) {
    const stale = this.db.select({ id: authEvents.id }).from(authEvents).where(sql`${authEvents.createdAt} < now() - ${days} * interval '1 day'`).limit(batchSize);
    return (await this.db.delete(authEvents).where(sql`${authEvents.id} in ${stale}`).returning({ id: authEvents.id })).length;
  }
}
