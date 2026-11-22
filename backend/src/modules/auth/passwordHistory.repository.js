import { desc, eq, sql } from 'drizzle-orm';
import { passwordHistory } from '../../shared/db/schema/index.js';

export class PasswordHistoryRepository {
  constructor(db) { this.db = db; }

  recent(userId, limit) {
    return this.db.select({ passwordHash: passwordHistory.passwordHash }).from(passwordHistory).where(eq(passwordHistory.userId, userId)).orderBy(desc(passwordHistory.id)).limit(limit);
  }

  /** Remembers the hash being replaced and keeps only the newest `keep` rows for the user. */
  async remember(userId, passwordHash, keep) {
    if (!passwordHash || keep <= 0) return;
    await this.db.insert(passwordHistory).values({ userId, passwordHash });
    await this.db.execute(sql`delete from password_history where user_id = ${userId} and id not in (select id from password_history where user_id = ${userId} order by id desc limit ${keep})`);
  }
}
