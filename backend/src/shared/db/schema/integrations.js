import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces.js';

/** A workspace's connection to an outside service (see modules/integrations). Secrets are encrypted at rest and never leave the server. */
export const workspaceIntegrations = pgTable('workspace_integrations', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').notNull().default({}),
  secretsEnc: text('secrets_enc'),
  status: text('status').notNull().default('untested'), // untested | connected | error
  statusMessage: text('status_message'),
  testedAt: timestamp('tested_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.provider] })]);
