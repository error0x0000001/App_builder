import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

/** Permission-set add-ons assigned to a person (see modules/access/addons.service.js). */
export const userPermissionSets = pgTable('user_permission_sets', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permissionSet: text('permission_set').notNull(),
  assignedBy: uuid('assigned_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId, t.permissionSet] }), index('user_permission_sets_by_set_idx').on(t.workspaceId, t.permissionSet, t.userId)]);
