import { boolean, foreignKey, index, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, pk, tz } from '../helpers.js';
import { tenants } from './tenants.js';

/** A space inside a tenant (company, branch, team). Definitions are tenant-wide; records and conversations live in one workspace. */
export const workspaces = pgTable(
  'workspaces',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    archivedAt: tz('archived_at'),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('workspaces_slug_uq').on(t.tenantId, t.slug),
    uniqueIndex('workspaces_name_uq').on(t.tenantId, sql`lower(${t.name})`).where(sql`${t.archivedAt} is null`),
    uniqueIndex('workspaces_one_default_uq').on(t.tenantId).where(sql`${t.isDefault}`),
  ],
);

/** Which workspaces a member may use (assigned by an admin). Exactly one is the person's default. */
export const workspaceAssignments = pgTable(
  'workspace_assignments',
  {
    tenantId: uuid('tenant_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    foreignKey({ columns: [t.tenantId, t.workspaceId], foreignColumns: [workspaces.tenantId, workspaces.id] }).onDelete('cascade'),
    index('workspace_assignments_user_idx').on(t.tenantId, t.userId),
    uniqueIndex('workspace_assignments_one_default_uq').on(t.tenantId, t.userId).where(sql`${t.isDefault}`),
  ],
);
