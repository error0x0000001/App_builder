import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { authTokens } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class AuthTokenRepository {
  constructor(db) { this.db = db; }

  async create(values) { return first(await this.db.insert(authTokens).values(values).returning()); }
  async findById(id) { return first(await this.db.select().from(authTokens).where(eq(authTokens.id, id)).limit(1)); }

  async findLatest(userId, type) {
    return first(
      await this.db.select().from(authTokens)
        .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.consumedAt)))
        .orderBy(desc(authTokens.createdAt)).limit(1),
    );
  }

  incrementAttempts(id) { return this.db.update(authTokens).set({ attempts: sql`${authTokens.attempts} + 1` }).where(eq(authTokens.id, id)); }

  /** Atomic single use: exactly one caller can flip consumed_at. */
  async consume(id) {
    const rows = await this.db.update(authTokens).set({ consumedAt: new Date() })
      .where(and(eq(authTokens.id, id), isNull(authTokens.consumedAt), sql`${authTokens.expiresAt} > now()`)).returning({ id: authTokens.id });
    return rows.length === 1;
  }

  invalidateAll(userId, type) {
    return this.db.update(authTokens).set({ consumedAt: new Date() })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.consumedAt)));
  }

  async deleteExpired(batchSize) {
    const stale = this.db.select({ id: authTokens.id }).from(authTokens).where(lt(authTokens.expiresAt, sql`now() - interval '1 day'`)).limit(batchSize);
    return (await this.db.delete(authTokens).where(inArray(authTokens.id, stale)).returning({ id: authTokens.id })).length;
  }
}
