import { sql } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import { rateLimits } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class RateLimitRepository {
  constructor(db) { this.db = db; }

  /** Atomic fixed-window counter shared by every API instance. */
  async hit(key, windowSeconds) {
    const resetAt = sql`now() + ${windowSeconds} * interval '1 second'`;
    return first(
      await this.db.insert(rateLimits).values({ key, count: 1, resetAt })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            count: sql`case when ${rateLimits.resetAt} < now() then 1 else ${rateLimits.count} + 1 end`,
            resetAt: sql`case when ${rateLimits.resetAt} < now() then ${resetAt} else ${rateLimits.resetAt} end`,
          },
        })
        .returning({ count: rateLimits.count, retryAfter: sql`greatest(1, ceil(extract(epoch from ${rateLimits.resetAt} - now())))::int`.mapWith(Number) }),
    );
  }

  async deleteExpired(batchSize) {
    const stale = this.db.select({ key: rateLimits.key }).from(rateLimits).where(sql`${rateLimits.resetAt} < now()`).limit(batchSize);
    return (await this.db.delete(rateLimits).where(inArray(rateLimits.key, stale)).returning({ key: rateLimits.key })).length;
  }
}
