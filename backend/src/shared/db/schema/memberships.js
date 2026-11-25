import { index, pgEnum, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { ROLES } from '@app/shared';
import { createdAt } from '../helpers.js';
import { users } from './users.js';
import { tenants } from './tenants.js';

export const tenantRole = pgEnum('tenant_role', ROLES);

export const memberships = pgTable(
  'memberships',
  {
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: tenantRole('role').notNull().default('member'),
    profile: text('profile'), // Setup profile name (grants come from Object Settings rows of that name); null = role defaults
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId] }),
    index('memberships_user_idx').on(t.userId, t.createdAt), // "my tenants"
    index('memberships_role_profile_idx').on(t.tenantId, t.role, t.profile), // counts / filters by role and profile
    index('memberships_tenant_page_idx').on(t.tenantId, t.createdAt, t.userId), // keyset member listing
  ],
);
