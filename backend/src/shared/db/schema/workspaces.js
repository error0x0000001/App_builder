import { jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tz } from '../helpers.js';
import { users } from './users.js';

export const workspaces = pgTable(
  'workspaces',
  {
    id: pk(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    industry: text('industry'),
    teamSize: text('team_size'),
    timezone: text('timezone'),
    uiSettings: jsonb('ui_settings').notNull().default({}), // owner's UI customization (see shared UI_OPTIONS)
    theme: text('theme').notNull().default('graphite'), // tenant colour theme, chosen by admins (see TENANT_THEMES)
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    onboardedAt: tz('onboarded_at'),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('workspaces_slug_uq').on(t.slug)],
);
