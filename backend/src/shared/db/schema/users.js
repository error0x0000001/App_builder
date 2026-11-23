import { boolean, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tz } from '../helpers.js';

export const userStatus = pgEnum('user_status', ['active', 'disabled']);

export const users = pgTable(
  'users',
  {
    id: pk(),
    email: text('email').notNull(), // always stored lower-cased (see emailField)
    emailVerifiedAt: tz('email_verified_at'),
    passwordHash: text('password_hash'), // null for OAuth-only accounts
    passwordChangedAt: tz('password_changed_at'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    jobTitle: text('job_title'),
    phone: text('phone'),
    country: text('country'),
    status: userStatus('status').notNull().default('active'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: tz('locked_until'),
    lastLoginAt: tz('last_login_at'),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaLastStep: integer('mfa_last_step').notNull().default(0),
    avatarVersion: integer('avatar_version').notNull().default(0), // 0 = no profile photo; bumped on every change (cache-busting + signed URL)
    lastWorkspaceId: uuid('last_workspace_id'),
    preferences: jsonb('preferences').notNull().default({}), // personal UI preferences (theme mode), follows the person across devices
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);
