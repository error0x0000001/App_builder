import { Router } from 'express';
import { z } from 'zod';
import {
  addMembersSchema, chatSearchQuerySchema, createDmSchema, createGroupSchema, editMessageSchema, inboxQuerySchema, memberRoleSchema, memberStateSchema,
  callModerateSchema, createPollSchema, disappearSchema, linkPreviewQuerySchema, mediaQuerySchema, starMessageSchema, starredQuerySchema, voteSchema, callStartSchema, messagesQuerySchema, patchConversationSchema, reactionSchema, readSchema, sendMessageSchema, uuidField,
} from '@app/shared';
import { TooManyRequestsError } from '../../../shared/errors.js';
import { receiveUpload, tooLarge } from '../middleware/upload.js';
import { PHOTO_MAX_BYTES } from '../../../modules/users/photoStore.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveTenantRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { config } from '../../../shared/config.js';

const idParam = z.object({ id: uuidField });
const messageParams = z.object({ id: uuidField, messageId: uuidField });
const memberParams = z.object({ id: uuidField, userId: uuidField });
const codeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });

/** Chat. Any organisation member may call; the service authorises per conversation (membership is the only rule). */
export function chatRoutes({ tokens, membershipLookup, cache, chat, presence, calls, drive, icons, linkPreviews }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveTenantRole(membershipLookup, 'viewer'));
  router.use((req, res, next) => {
    try {
      if (!cache.allow(`chat-api:${req.auth.tenantId}`, 60, config.SETUP_REQUESTS_PER_MINUTE * 4)) throw new TooManyRequestsError(60);
      req.chatCtx = { tenantId: req.auth.tenantId, userId: req.auth.userId, actor: req.membership };
      next();
    } catch (error) { next(error); }
  });
  const ctx = (req) => req.chatCtx;
  const send = (res, data, status = 200) => res.status(status).set('Cache-Control', 'private, no-store').json(data);

  router.get('/conversations', validate({ query: inboxQuerySchema }), async (req, res) => send(res, await chat.inbox(ctx(req), { archived: req.valid.query.archived === '1', limit: req.valid.query.limit })));
  router.get('/unread', async (req, res) => send(res, await chat.unreadTotal(ctx(req))));
  router.post('/dm', validate({ body: createDmSchema }), async (req, res) => send(res, await chat.createDm(ctx(req), req.valid.body)));
  router.post('/groups', validate({ body: createGroupSchema }), async (req, res) => send(res, await chat.createGroup(ctx(req), req.valid.body), 201));
  router.post('/join/:code', validate({ params: codeParams }), async (req, res) => send(res, await chat.joinByInvite(ctx(req), req.params.code)));

  router.get('/conversations/:id', validate({ params: idParam }), async (req, res) => send(res, await chat.get(ctx(req), req.params.id)));
  router.patch('/conversations/:id', validate({ params: idParam, body: patchConversationSchema }), async (req, res) => send(res, await chat.update(ctx(req), req.params.id, req.valid.body)));
  router.patch('/conversations/:id/state', validate({ params: idParam, body: memberStateSchema }), async (req, res) => send(res, await chat.setState(ctx(req), req.params.id, req.valid.body)));
  router.put('/conversations/:id/legal-hold', validate({ params: idParam, body: z.object({ on: z.boolean() }).strict() }), async (req, res) => send(res, await chat.setLegalHold(ctx(req), req.params.id, req.valid.body.on)));
  router.post('/conversations/:id/invite', validate({ params: idParam }), async (req, res) => send(res, await chat.createInvite(ctx(req), req.params.id), 201));
  router.delete('/conversations/:id/invite', validate({ params: idParam }), async (req, res) => send(res, await chat.revokeInvite(ctx(req), req.params.id)));

  router.post('/conversations/:id/members', validate({ params: idParam, body: addMembersSchema }), async (req, res) => send(res, await chat.addMembers(ctx(req), req.params.id, req.valid.body)));
  router.put('/conversations/:id/members/:userId', validate({ params: memberParams, body: memberRoleSchema }), async (req, res) => send(res, await chat.setRole(ctx(req), req.params.id, req.params.userId, req.valid.body)));
  router.delete('/conversations/:id/members/:userId', validate({ params: memberParams }), async (req, res) => send(res, await chat.removeMember(ctx(req), req.params.id, req.params.userId)));

  router.get('/conversations/:id/messages', validate({ params: idParam, query: messagesQuerySchema }), async (req, res) => send(res, await chat.messages(ctx(req), req.params.id, req.valid.query)));
  router.post('/conversations/:id/messages', validate({ params: idParam, body: sendMessageSchema }), async (req, res) => {
    const result = await chat.send(ctx(req), req.params.id, req.valid.body);
    send(res, result, result.duplicate ? 200 : 201);
  });
  router.patch('/conversations/:id/messages/:messageId', validate({ params: messageParams, body: editMessageSchema }), async (req, res) => send(res, await chat.edit(ctx(req), req.params.id, req.params.messageId, req.valid.body)));
  router.delete('/conversations/:id/messages/:messageId', validate({ params: messageParams }), async (req, res) => send(res, await chat.remove(ctx(req), req.params.id, req.params.messageId)));
  router.put('/conversations/:id/messages/:messageId/reactions', validate({ params: messageParams, body: reactionSchema }), async (req, res) => send(res, await chat.react(ctx(req), req.params.id, req.params.messageId, req.valid.body)));
  router.put('/conversations/:id/messages/:messageId/pin', validate({ params: messageParams }), async (req, res) => send(res, await chat.pin(ctx(req), req.params.id, req.params.messageId)));
  router.get('/conversations/:id/pins', validate({ params: idParam }), async (req, res) => send(res, await chat.pins(ctx(req), req.params.id)));
  router.post('/conversations/:id/read', validate({ params: idParam, body: readSchema }), async (req, res) => send(res, await chat.markRead(ctx(req), req.params.id, req.valid.body)));

  router.get('/config', async (req, res) => send(res, await calls.config()));
  router.post('/conversations/:id/call', validate({ params: idParam, body: callStartSchema }), async (req, res) => send(res, await calls.start(ctx(req), req.params.id, req.valid.body), 201));
  router.post('/conversations/:id/call/join', validate({ params: idParam }), async (req, res) => send(res, await calls.join(ctx(req), req.params.id)));
  router.post('/conversations/:id/call/decline', validate({ params: idParam }), async (req, res) => send(res, await calls.decline(ctx(req), req.params.id)));
  router.post('/conversations/:id/call/leave', validate({ params: idParam }), async (req, res) => send(res, await calls.leave(ctx(req), req.params.id)));
  router.post('/conversations/:id/call/moderate', validate({ params: idParam, body: callModerateSchema }), async (req, res) => send(res, await calls.moderate(ctx(req), req.params.id, req.valid.body)));
  router.post('/conversations/:id/call/end', validate({ params: idParam }), async (req, res) => send(res, await calls.end(ctx(req), req.params.id)));

  router.get('/conversations/:id/shared', validate({ params: idParam, query: mediaQuerySchema }), async (req, res) => send(res, await chat.shared(ctx(req), req.params.id, req.valid.query)));
  router.get('/people/:userId/common-groups', validate({ params: z.object({ userId: uuidField }) }), async (req, res) => send(res, await chat.commonGroups(ctx(req), req.params.userId)));
  // Attachments: the file goes into the conversation's folder in Documents (members only); the message then references it by id.
  router.post('/conversations/:id/files', validate({ params: idParam }), async (req, res, next) => {
    try {
      const declared = Number(req.headers['content-length']) || undefined;
      const result = await receiveUpload(req, ({ stream, filename, mime }) => drive.uploadToChat(ctx(req), req.params.id, { filename, mime, stream, declaredSize: declared })).catch((error) => { throw tooLarge(error); });
      send(res, { file: { id: result.file.id, name: result.file.name, mime: result.file.mime, size: result.file.size } }, 201);
    } catch (error) { next(error); }
  });

  router.put('/conversations/:id/messages/:messageId/star', validate({ params: messageParams, body: starMessageSchema }), async (req, res) => send(res, await chat.star(ctx(req), req.params.id, req.params.messageId, req.valid.body)));
  router.delete('/conversations/:id/messages/:messageId/me', validate({ params: messageParams }), async (req, res) => send(res, await chat.hideForMe(ctx(req), req.params.id, req.params.messageId)));
  router.get('/starred', validate({ query: starredQuerySchema }), async (req, res) => send(res, await chat.starred(ctx(req), req.valid.query)));
  router.get('/conversations/:id/messages/:messageId/info', validate({ params: messageParams }), async (req, res) => send(res, await chat.messageInfo(ctx(req), req.params.id, req.params.messageId)));
  router.put('/conversations/:id/disappearing', validate({ params: idParam, body: disappearSchema }), async (req, res) => send(res, await chat.setDisappearing(ctx(req), req.params.id, req.valid.body)));
  router.post('/conversations/:id/polls', validate({ params: idParam, body: createPollSchema }), async (req, res) => {
    const result = await chat.createPoll(ctx(req), req.params.id, req.valid.body);
    send(res, result, result.duplicate ? 200 : 201);
  });
  router.put('/conversations/:id/messages/:messageId/vote', validate({ params: messageParams, body: voteSchema }), async (req, res) => send(res, await chat.vote(ctx(req), req.params.id, req.params.messageId, req.valid.body)));
  router.get('/link-preview', validate({ query: linkPreviewQuerySchema }), async (req, res) => send(res, await linkPreviews.preview(ctx(req), req.valid.query.url)));
  // Group icon: admins only; the browser sends a cropped JPEG.
  router.put('/conversations/:id/icon', validate({ params: idParam }), async (req, res, next) => {
    try {
      await chat.groupAdmin(ctx(req), req.params.id);
      const { photo } = await receiveUpload(req, ({ stream }) => icons.set(req.params.id, stream), { maxFileBytes: PHOTO_MAX_BYTES });
      await chat.announce(req.params.id, { type: 'conversation.updated' });
      send(res, { icon: photo });
    } catch (error) { next(error); }
  });
  router.delete('/conversations/:id/icon', validate({ params: idParam }), async (req, res) => {
    await chat.groupAdmin(ctx(req), req.params.id);
    const { photo } = await icons.remove(req.params.id);
    await chat.announce(req.params.id, { type: 'conversation.updated' });
    send(res, { icon: photo });
  });

  router.get('/search', validate({ query: chatSearchQuerySchema }), async (req, res) => send(res, await chat.search(ctx(req), req.valid.query)));
  router.get('/presence', validate({ query: z.object({ ids: z.string().regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,99}$/i) }) }), async (req, res) => send(res, { online: await presence.online(req.auth.tenantId, req.valid.query.ids.split(',')) }));

  return router;
}
