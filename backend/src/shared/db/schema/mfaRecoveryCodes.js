import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tz } from '../helpers.js';
import { users } from './users.js';

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: pk(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: tz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('mfa_recovery_user_code_uq').on(t.userId, t.codeHash)],
);
