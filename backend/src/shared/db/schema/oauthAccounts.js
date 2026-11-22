import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '../helpers.js';
import { users } from './users.js';

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: pk(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('oauth_provider_account_uq').on(t.provider, t.providerUserId),
    index('oauth_user_idx').on(t.userId),
  ],
);
