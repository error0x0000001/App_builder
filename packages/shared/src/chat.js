import { z } from 'zod';
import { uuidField } from './schemas/fields.js';

/** Chat (and calls): limits and validation shared by the API, the realtime tier and the UI. */
export const CHAT_MAX_BODY = 8000;
export const CHAT_MAX_GROUP_MEMBERS = 1024;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_MEMBER_ROLES = Object.freeze(['member', 'admin']);
export const CHAT_REACTIONS = Object.freeze(['👍', '❤️', '😂', '😮', '😢', '🙏']);

export const chatBodySchema = z.string().max(CHAT_MAX_BODY, `Messages are limited to ${CHAT_MAX_BODY} characters`);
const titleSchema = z.string().trim().min(1, 'Enter a name').max(80, 'That name is too long');
const descriptionSchema = z.string().trim().max(500).nullable();

export const createDmSchema = z.object({ userId: uuidField }).strict();
export const createGroupSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  memberIds: z.array(uuidField).max(CHAT_MAX_GROUP_MEMBERS).default([]),
  meetingAt: z.string().datetime().nullable().optional(), // a scheduled meeting is a conversation with a time
}).strict();
export const patchConversationSchema = z.object({ title: titleSchema.optional(), description: descriptionSchema.optional(), meetingAt: z.string().datetime().nullable().optional() }).strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const addMembersSchema = z.object({ userIds: z.array(uuidField).min(1).max(CHAT_MAX_GROUP_MEMBERS) }).strict();
export const memberRoleSchema = z.object({ role: z.enum(CHAT_MEMBER_ROLES) }).strict();
export const memberStateSchema = z.object({
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const sendMessageSchema = z.object({
  id: uuidField.optional(), // client-generated UUIDv7: a retry with the same id never posts twice
  body: chatBodySchema.default(''),
  replyTo: uuidField.nullable().optional(),
  attachments: z.array(uuidField).max(10).default([]), // Documents file ids
  mentions: z.array(uuidField).max(50).default([]),
  forwardOf: z.object({ conversationId: uuidField, messageId: uuidField }).strict().optional(),
}).strict().refine((v) => v.body.trim().length > 0 || v.attachments.length > 0 || v.forwardOf, 'Write a message or attach a file');
export const editMessageSchema = z.object({ body: chatBodySchema.refine((v) => v.trim().length > 0, 'A message cannot be empty') }).strict();
export const reactionSchema = z.object({ emoji: z.string().min(1).max(16) }).strict();
export const readSchema = z.object({ messageId: uuidField }).strict();
export const messagesQuerySchema = z.object({
  before: uuidField.optional(),
  after: uuidField.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(CHAT_PAGE_SIZE),
}).strict();
export const inboxQuerySchema = z.object({ archived: z.enum(['1']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const chatSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  conversationId: uuidField.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
}).strict();
export const callModerateSchema = z.object({ action: z.enum(['mute', 'mute-all', 'remove']), userId: uuidField.optional() }).strict();
export const callStartSchema = z.object({ video: z.boolean().default(true) }).strict();

/** The two people of a direct conversation, in one canonical order — the key that makes "open a DM" idempotent. */
export const dmKeyOf = (a, b) => [a, b].sort().join(':');
