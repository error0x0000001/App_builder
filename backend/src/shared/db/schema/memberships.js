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
    profileId: uuid('profile_id'), // the person's profile (profiles.id); null = the role's defaults
    hierarchyRoleId: uuid('hierarchy_role_id'), // where the person sits in the role hierarchy (hierarchy_roles.id)
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId] }),
    index('memberships_user_idx').on(t.userId, t.createdAt), // "my tenants"
    index('memberships_role_profile_id_idx').on(t.tenantId, t.role, t.profileId), // counts / filters by role and profile
    index('memberships_tenant_page_idx').on(t.tenantId, t.createdAt, t.userId), // keyset member listing
  ],
);
