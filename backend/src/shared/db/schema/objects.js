import { boolean, foreignKey, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, pk, tz } from '../helpers.js';
import { tenants } from './tenants.js';

/** Object definitions (configuration). Per tenant, identical in every workspace. */
export const objects = pgTable(
  'objects',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    pluralLabel: text('plural_label').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('layers'),
    color: text('color').notNull().default('brand'),
    kind: text('kind').notNull().default('custom'),
    workspaceScope: text('workspace_scope').notNull().default('workspace'),
    hasOwner: boolean('has_owner').notNull().default(true),
    allowReports: boolean('allow_reports').notNull().default(true),
    allowActivities: boolean('allow_activities').notNull().default(false),
    allowAttachments: boolean('allow_attachments').notNull().default(true),
    trackHistory: boolean('track_history').notNull().default(false),
    allowSearch: boolean('allow_search').notNull().default(true),
    recordName: jsonb('record_name').notNull().default({ kind: 'field' }),
    recordRules: jsonb('record_rules').notNull().default([]),
    deploymentStatus: text('deployment_status').notNull().default('deployed'),
    archivedAt: tz('archived_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('objects_key_uq').on(t.tenantId, sql`lower(${t.key})`), index('objects_list_idx').on(t.tenantId, t.archivedAt, sql`lower(${t.label})`)],
);

/** Field definitions. `settings`, `rules`, `validations` and `autofill` are validated by the type registry before they are saved. */
export const fields = pgTable(
  'fields',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull(),
    objectId: uuid('object_id').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    type: text('type').notNull(),
    helpText: text('help_text').notNull().default(''),
    description: text('description').notNull().default(''),
    required: boolean('required').notNull().default(false),
    isUnique: boolean('is_unique').notNull().default(false),
    indexed: boolean('indexed').notNull().default(false),
    encrypted: boolean('encrypted').notNull().default(false),
    readOnly: boolean('read_only').notNull().default(false),
    defaultValue: jsonb('default_value'),
    settings: jsonb('settings').notNull().default({}),
    rules: jsonb('rules').notNull().default([]),
    validations: jsonb('validations').notNull().default([]),
    autofill: jsonb('autofill').notNull().default([]),
    section: text('section').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    system: boolean('system').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.objectId], foreignColumns: [objects.tenantId, objects.id] }).onDelete('cascade'),
    uniqueIndex('fields_key_uq').on(t.objectId, sql`lower(${t.key})`),
    index('fields_list_idx').on(t.tenantId, t.objectId, t.sortOrder, t.id),
  ],
);
