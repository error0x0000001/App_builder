import { index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tz } from '../helpers.js';
import { users } from './users.js';

export const authTokenType = pgEnum('auth_token_type', ['email_verification', 'password_reset']);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: pk(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: authTokenType('type').notNull(),
    tokenHash: text('token_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: tz('expires_at').notNull(),
    consumedAt: tz('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('auth_tokens_lookup_idx').on(t.userId, t.type, t.createdAt),
    index('auth_tokens_expires_idx').on(t.expiresAt),
  ],
);
