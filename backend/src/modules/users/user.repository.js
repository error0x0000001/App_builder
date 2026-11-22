import { eq, sql } from 'drizzle-orm';
import { users } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class UserRepository {
  constructor(db) { this.db = db; }

  async findById(id) { return first(await this.db.select().from(users).where(eq(users.id, id)).limit(1)); }
  async findByEmail(email) { return first(await this.db.select().from(users).where(eq(users.email, email)).limit(1)); }
  async create(values) { return first(await this.db.insert(users).values(values).returning()); }
  async update(id, values) { return first(await this.db.update(users).set(values).where(eq(users.id, id)).returning()); }

  /** Atomic counter + lock decision in a single statement (no read-modify-write race). */
  async recordFailedLogin(id, { maxAttempts, lockMs }) {
    const lockExpired = sql`${users.lockedUntil} is not null and ${users.lockedUntil} < now()`;
    const nextCount = sql`case when ${lockExpired} then 1 else ${users.failedLoginCount} + 1 end`;
    return first(
      await this.db.update(users)
        .set({
          failedLoginCount: nextCount,
          lockedUntil: sql`case when ${nextCount} >= ${maxAttempts} then now() + ${lockMs} * interval '1 millisecond' else null end`,
        })
        .where(eq(users.id, id))
        .returning({ failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil }),
    );
  }

  recordSuccessfulLogin(id) {
    return this.db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  /** Replay protection: only advance the TOTP step forward. Returns true if accepted. */
  async claimMfaStep(id, step) {
    const rows = await this.db.update(users).set({ mfaLastStep: step })
      .where(sql`${users.id} = ${id} and ${users.mfaLastStep} < ${step}`).returning({ id: users.id });
    return rows.length === 1;
  }
}
