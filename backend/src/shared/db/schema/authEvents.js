import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '../helpers.js';

/** Append-only security audit trail. No FKs so history survives account deletion; partition by month at scale. */
export const authEvents = pgTable(
  'auth_events',
  {
    id: pk(),
    userId: uuid('user_id'),
    tenantId: uuid('tenant_id'),
    type: text('type').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => [
    index('auth_events_user_idx').on(t.userId, t.id.desc()), // UUIDv7 ids sort by time
    index('auth_events_created_idx').on(t.createdAt),
    index('auth_events_tenant_idx').on(t.tenantId, t.id.desc()), // tenant-wide login history
  ],
);
