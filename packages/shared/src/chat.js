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
export const mediaQuerySchema = z.object({ type: z.enum(['media', 'docs', 'links']), before: uuidField.optional(), limit: z.coerce.number().int().min(1).max(60).default(30) }).strict();
export const inboxQuerySchema = z.object({ archived: z.enum(['1']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const chatSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  conversationId: uuidField.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
}).strict();
export const callModerateSchema = z.object({ action: z.enum(['mute', 'mute-all', 'remove', 'lower-hand']), userId: uuidField.optional() }).strict();
export const callStartSchema = z.object({ video: z.boolean().default(true) }).strict();

export const DISAPPEAR_OPTIONS = Object.freeze([{ seconds: 0, label: 'Off' }, { seconds: 86_400, label: '24 hours' }, { seconds: 604_800, label: '7 days' }, { seconds: 7_776_000, label: '90 days' }]);
export const disappearSchema = z.object({ seconds: z.union([z.literal(0), z.literal(86_400), z.literal(604_800), z.literal(7_776_000)]) }).strict();
export const createPollSchema = z.object({
  id: uuidField.optional(),
  question: z.string().trim().min(1, 'Ask a question').max(300),
  options: z.array(z.string().trim().min(1, 'An option cannot be empty').max(100)).min(2, 'Add at least two options').max(12),
  multi: z.boolean().default(false),
}).strict().refine((v) => new Set(v.options.map((o) => o.toLowerCase())).size === v.options.length, 'Options must be different');
export const voteSchema = z.object({ options: z.array(z.number().int().min(0).max(11)).max(12) }).strict();
export const starMessageSchema = z.object({ on: z.boolean() }).strict();
export const starredQuerySchema = z.object({ before: uuidField.optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }).strict();
export const linkPreviewQuerySchema = z.object({ url: z.string().url().max(2000) }).strict();
/** A meeting is created from a form with a date and a time; the browser combines them into `meetingAt`. */
export const meetingFormSchema = z.object({ title: titleSchema, date: z.string().min(1, 'Choose a date'), time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time') }).strict();

/** The two people of a direct conversation, in one canonical order — the key that makes "open a DM" idempotent. */
export const dmKeyOf = (a, b) => [a, b].sort().join(':');
