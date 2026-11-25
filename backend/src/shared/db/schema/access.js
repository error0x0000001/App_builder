import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tz } from '../helpers.js';

// The remaining access-control tables (permission_sets, object_permissions, permission_set_assignments, sharing_defaults, password/session/login
// policies, network_ranges, audit_log) are written and read with SQL in their repositories (modules/access, modules/security, modules/audit);
// only the two the query builder joins against are declared here. The migrations are the source of truth for all of them.

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  userLicense: text('user_license').notNull().default('Quelli'),
  isSystem: boolean('is_system').notNull().default(false),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').defaultNow().notNull(),
});

export const hierarchyRoles = pgTable('hierarchy_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  path: text('path').notNull(),
  depth: integer('depth').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index('hierarchy_roles_path_idx').on(t.tenantId, t.path)]);
