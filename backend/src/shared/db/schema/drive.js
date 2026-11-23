import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tz } from '../helpers.js';

/**
 * Documents (the Drive). Folders form a tree; `path` is the materialised list of ancestor ids ("/a/b/c/") so subtree questions
 * (who can see this, move this, trash this) are one indexed prefix scan. `kind`: folder (normal) | records (the Records tree) | record (one
 * record's attachments, access = the record's own permission).
 */
export const driveFolders = pgTable(
  'drive_folders',
  {
    id: pk(),
    workspaceId: uuid('workspace_id').notNull(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    path: text('path').notNull(),
    kind: text('kind').notNull().default('folder'),
    recordObject: text('record_object'),
    recordId: uuid('record_id'),
    inherit: boolean('inherit').notNull().default(true), // false = does not inherit access from its parent ("Restricted")
    ownerId: uuid('owner_id').notNull(),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull(),
    trashedAt: tz('trashed_at'),
  },
  (t) => [
    index('drive_folders_list_idx').on(t.workspaceId, t.parentId, t.name),
    index('drive_folders_owner_idx').on(t.workspaceId, t.ownerId),
    uniqueIndex('drive_folders_record_uq').on(t.workspaceId, t.recordObject, t.recordId).where(sql`${t.kind} = 'record'`),
  ],
);

/** A stored file. The bytes live in the StorageDriver under `storageKey`; `folderPath` copies the folder's path for ACL-aware queries. */
export const driveFiles = pgTable(
  'drive_files',
  {
    id: pk(),
    workspaceId: uuid('workspace_id').notNull(),
    folderId: uuid('folder_id').notNull(),
    folderPath: text('folder_path').notNull(),
    name: text('name').notNull(),
    mime: text('mime').notNull().default('application/octet-stream'),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    storageKey: text('storage_key').notNull(),
    checksum: text('checksum').notNull(),
    ownerId: uuid('owner_id').notNull(),
    recordObject: text('record_object'),
    recordId: uuid('record_id'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').defaultNow().notNull(),
    trashedAt: tz('trashed_at'),
  },
  (t) => [
    index('drive_files_list_idx').on(t.workspaceId, t.folderId, t.name),
    index('drive_files_recent_idx').on(t.workspaceId, t.ownerId, t.updatedAt.desc()),
    index('drive_files_record_idx').on(t.workspaceId, t.recordObject, t.recordId),
  ],
);

/** Who may use a folder (and everything below it until a Restricted folder). principal = a person, or the whole workspace (id = workspace id). */
export const driveAccess = pgTable(
  'drive_access',
  {
    id: pk(),
    workspaceId: uuid('workspace_id').notNull(),
    folderId: uuid('folder_id').notNull(),
    principalType: text('principal_type').notNull(), // 'user' | 'workspace'
    principalId: uuid('principal_id').notNull(),
    role: text('role').notNull(), // viewer | editor | manager
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('drive_access_uq').on(t.folderId, t.principalType, t.principalId),
    index('drive_access_principal_idx').on(t.workspaceId, t.principalId),
  ],
);

export const driveStars = pgTable(
  'drive_stars',
  {
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    itemType: text('item_type').notNull(), // 'folder' | 'file'
    itemId: uuid('item_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemType, t.itemId] })],
);
