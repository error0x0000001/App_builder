import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, pk, tz } from '../helpers.js';
import { tenantRole } from './memberships.js';
import { users } from './users.js';
import { tenants } from './tenants.js';

export const invitations = pgTable(
  'invitations',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: tenantRole('role').notNull().default('member'),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: tz('expires_at').notNull(),
    acceptedAt: tz('accepted_at'),
    revokedAt: tz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('invitations_pending_uq').on(t.tenantId, t.email).where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index('invitations_tenant_idx').on(t.tenantId, t.createdAt),
    index('invitations_expires_idx').on(t.expiresAt),
  ],
);
