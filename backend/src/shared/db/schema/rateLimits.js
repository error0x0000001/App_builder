import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { tz } from '../helpers.js';

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: tz('reset_at').notNull(),
  },
  (t) => [index('rate_limits_reset_idx').on(t.resetAt)],
);
