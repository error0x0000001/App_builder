import { and, eq, isNull } from 'drizzle-orm';
import { mfaRecoveryCodes } from '../../shared/db/schema/index.js';

export class RecoveryCodeRepository {
  constructor(db) { this.db = db; }

  async replaceAll(userId, codeHashes) {
    await this.db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    if (codeHashes.length) await this.db.insert(mfaRecoveryCodes).values(codeHashes.map((codeHash) => ({ userId, codeHash })));
  }

  deleteAll(userId) { return this.db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId)); }

  /** Atomic single use. */
  async consume(userId, codeHash) {
    return (await this.db.update(mfaRecoveryCodes).set({ usedAt: new Date() })
      .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, codeHash), isNull(mfaRecoveryCodes.usedAt))).returning({ id: mfaRecoveryCodes.id })).length === 1;
  }

  async countRemaining(userId) {
    return (await this.db.select({ id: mfaRecoveryCodes.id }).from(mfaRecoveryCodes).where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)))).length;
  }
}
