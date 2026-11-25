import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, pk, tz } from '../helpers.js';
import { users } from './users.js';
import { tenants } from './tenants.js';

export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    refreshHash: text('refresh_hash').notNull(),
    prevRefreshHash: text('prev_refresh_hash'), // previous token — presenting it again means theft
    persistent: boolean('persistent').notNull().default(true), // "remember me": persistent vs browser-session cookie
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastUsedAt: tz('last_used_at').defaultNow().notNull(),
    expiresAt: tz('expires_at').notNull(),
    revokedAt: tz('revoked_at'),
    revokedReason: text('revoked_reason'),
  },
  (t) => [
    index('sessions_user_active_idx').on(t.userId, t.lastUsedAt).where(sql`${t.revokedAt} is null`),
    index('sessions_expires_idx').on(t.expiresAt),
    index('sessions_tenant_active_idx').on(t.tenantId, t.lastUsedAt).where(sql`${t.revokedAt} is null`), // session management
  ],
);
