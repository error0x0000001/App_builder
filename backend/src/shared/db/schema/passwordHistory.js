import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '../helpers.js';

/** Previous password hashes, kept only as many as the strictest "enforce password history" policy needs. */
export const passwordHistory = pgTable(
  'password_history',
  { id: pk(), userId: uuid('user_id').notNull(), passwordHash: text('password_hash').notNull(), createdAt: createdAt() },
  (t) => [index('password_history_user_idx').on(t.userId, t.id.desc())],
);
