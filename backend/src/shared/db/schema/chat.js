import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tz } from '../helpers.js';

/**
 * Chat (and calls — a call is something a conversation does). `kind`: dm (exactly two members, `dm_key` makes creation idempotent) |
 * group. `meeting_at` turns a conversation into a scheduled meeting. `last_message_*` is denormalised so the inbox is one indexed query.
 */
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: pk(),
    workspaceId: uuid('workspace_id').notNull(),
    kind: text('kind').notNull(),
    dmKey: text('dm_key'),
    title: text('title'),
    description: text('description'),
    createdBy: uuid('created_by').notNull(),
    inviteCode: text('invite_code'),
    meetingAt: tz('meeting_at'),
    legalHold: boolean('legal_hold').notNull().default(false),
    lastMessageId: uuid('last_message_id'),
    lastMessageAt: tz('last_message_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('chat_conversations_dm_uq').on(t.workspaceId, t.dmKey).where(sql`${t.dmKey} is not null`),
    uniqueIndex('chat_conversations_invite_uq').on(t.inviteCode).where(sql`${t.inviteCode} is not null`),
  ],
);

/** Membership + per-member state. `last_read_id` is the read cursor: unread = messages after it (O(members), not O(members × messages)). */
export const chatMembers = pgTable(
  'chat_members',
  {
    conversationId: uuid('conversation_id').notNull(),
    userId: uuid('user_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    role: text('role').notNull().default('member'), // member | admin
    lastReadId: uuid('last_read_id'),
    mutedUntil: tz('muted_until'),
    pinned: boolean('pinned').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    joinedAt: tz('joined_at').defaultNow().notNull(),
    leftAt: tz('left_at'),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    // the inbox: my active conversations, newest activity first
    index('chat_members_user_idx').on(t.workspaceId, t.userId).where(sql`${t.leftAt} is null`),
  ],
);

/** Messages are HASH-partitioned by conversation (see migration) — every read is a single-partition keyset scan on (conversation_id, id). */
export const chatMessages = pgTable(
  'chat_messages',
  {
    conversationId: uuid('conversation_id').notNull(),
    id: uuid('id').notNull(), // client-generated UUIDv7: retries are idempotent and order follows time
    workspaceId: uuid('workspace_id').notNull(),
    senderId: uuid('sender_id'),
    kind: text('kind').notNull().default('text'), // text | system | call
    body: text('body').notNull().default(''),
    replyTo: uuid('reply_to'),
    forwarded: boolean('forwarded').notNull().default(false),
    attachments: jsonb('attachments').notNull().default([]),
    mentions: jsonb('mentions').notNull().default([]),
    editedAt: tz('edited_at'),
    deletedAt: tz('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.id] })],
);

export const chatReactions = pgTable(
  'chat_reactions',
  {
    conversationId: uuid('conversation_id').notNull(),
    messageId: uuid('message_id').notNull(),
    userId: uuid('user_id').notNull(),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.messageId, t.userId, t.emoji] })],
);

export const chatPins = pgTable(
  'chat_pins',
  {
    conversationId: uuid('conversation_id').notNull(),
    messageId: uuid('message_id').notNull(),
    pinnedBy: uuid('pinned_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.messageId] })],
);

/** A call in a conversation. At most one is active (ended_at null) per conversation; the media itself lives in LiveKit, room = conversation id. */
export const chatCalls = pgTable(
  'chat_calls',
  {
    id: pk(),
    workspaceId: uuid('workspace_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    startedBy: uuid('started_by').notNull(),
    video: boolean('video').notNull().default(true),
    joined: jsonb('joined').notNull().default([]), // user ids who actually joined (a call only the starter joined is "missed")
    startedAt: createdAt(),
    endedAt: tz('ended_at'),
  },
  (t) => [
    uniqueIndex('chat_calls_active_uq').on(t.conversationId).where(sql`${t.endedAt} is null`),
    index('chat_calls_history_idx').on(t.conversationId, t.startedAt),
  ],
);
