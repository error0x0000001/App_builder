import { index, pgEnum, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { ROLES } from '@app/shared';
import { createdAt } from '../helpers.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const workspaceRole = pgEnum('workspace_role', ROLES);

export const memberships = pgTable(
  'memberships',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull().default('member'),
    profile: text('profile'), // Setup profile name (grants come from Object Settings rows of that name); null = role defaults
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('memberships_user_idx').on(t.userId, t.createdAt), // "my workspaces"
    index('memberships_role_profile_idx').on(t.workspaceId, t.role, t.profile), // counts / filters by role and profile
    index('memberships_workspace_page_idx').on(t.workspaceId, t.createdAt, t.userId), // keyset member listing
  ],
);
