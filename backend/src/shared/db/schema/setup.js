import { index, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tz } from '../helpers.js';

/** One row per (workspace, settings page). `values` holds only what was changed; defaults come from the registry. */
export const setupSettings = pgTable(
  'setup_settings',
  {
    workspaceId: uuid('workspace_id').notNull(),
    pageKey: text('page_key').notNull(),
    values: jsonb('values').notNull().default({}),
    version: integer('version').notNull().default(1),
    updatedBy: uuid('updated_by'),
    updatedAt: tz('updated_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.pageKey] })],
);

/**
 * Generic record store for every Setup list (profiles, queues, rules, templates, roles, ...).
 * The real table is HASH-partitioned by workspace_id in the migration (drizzle cannot express partitions);
 * this definition exists for typed queries. Ids are UUIDv7 so `id DESC` is newest-first and keyset-friendly.
 */
export const setupRecords = pgTable(
  'setup_records',
  {
    id: pk(),
    workspaceId: uuid('workspace_id').notNull(),
    collection: text('collection').notNull(),
    parentId: uuid('parent_id'),
    label: text('label').notNull().default(''),
    status: text('status'),
    data: jsonb('data').notNull().default({}),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), index('setup_records_list_idx').on(t.workspaceId, t.collection, t.id.desc())],
);

/** "View Setup Audit Trail": append-only, no FKs. */
export const setupAudit = pgTable(
  'setup_audit',
  {
    id: pk(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id'),
    pageKey: text('page_key').notNull(),
    action: text('action').notNull(),
    summary: text('summary').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('setup_audit_ws_idx').on(t.workspaceId, t.id.desc())],
);
