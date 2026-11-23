import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';

const STALE_AFTER_MS = 12 * 3600_000; // a call row older than this with an empty room is a leftover, not a call
const EMPTY_GRACE_MS = 2 * 60_000; // a call that nobody is in yet is only reaped after this long (the caller is still connecting)

/**
 * Calls are something a conversation does (Meet is part of Chat). This service decides who may ring, join and end; media flows between
 * the browsers and LiveKit directly. Ringing and call state travel on the same realtime channels as chat.
 */
export class CallService {
  constructor({ db, chat, livekit }) { Object.assign(this, { db, chat, livekit }); }

  async #rows(query) { return (await this.db.execute(query)).rows; }

  #assertEnabled() { if (!this.livekit.enabled) throw new ConflictError('Calls are not configured on this server'); }

  #view = (row) => ({ id: row.id, video: row.video, startedBy: row.started_by, startedAt: row.created_at });

  async #active(conversationId) {
    const [row] = await this.#rows(sql`select * from chat_calls where conversation_id = ${conversationId} and ended_at is null`);
    return row ?? null;
  }

  /** Ends a call: marks it, tells everyone, and leaves one line in the conversation ("Missed call" / "Call ended · 4 min"). */
  async #finish(ctx, call, { closeRoom = false } = {}) {
    const [done] = await this.#rows(sql`update chat_calls set ended_at = now() where id = ${call.id} and ended_at is null returning created_at, ended_at, joined`);
    if (!done) return;
    if (closeRoom) await this.livekit.closeRoom(call.conversation_id).catch(() => {});
    const others = (done.joined ?? []).filter((id) => id !== call.started_by);
    const seconds = Math.max(0, Math.round((new Date(done.ended_at) - new Date(done.created_at)) / 1000));
    await this.chat.event({ workspaceId: call.workspace_id, userId: call.started_by }, call.conversation_id, 'call', others.length ? `ended:${seconds}:${call.video ? 'video' : 'audio'}` : `missed:0:${call.video ? 'video' : 'audio'}`, [call.id]);
    await this.chat.announce(call.conversation_id, { type: 'call.ended', callId: call.id });
    await this.chat.tell(await this.chat.memberIds(call.conversation_id), { type: 'call.dismissed', conversationId: call.conversation_id, callId: call.id });
  }

  /** Starts a call (or returns the one already running) and rings everyone else in the conversation. */
  async start(ctx, conversationId, { video }) {
    this.#assertEnabled();
    const m = await this.chat.member(ctx, conversationId);
    let call = await this.#active(conversationId);
    if (call) { // a leftover row (server restarted mid-call) must not block new calls
      const age = Date.now() - new Date(call.created_at);
      const room = await this.livekit.participants(conversationId).catch(() => null);
      if ((room && room.length === 0 && age > EMPTY_GRACE_MS) || age > STALE_AFTER_MS) { await this.#finish(ctx, call); call = null; }
    }
    if (call) return { call: this.#view(call), ringing: false };
    try {
      [call] = await this.#rows(sql`insert into chat_calls (id, workspace_id, conversation_id, started_by, video) values (${uuidv7()}, ${ctx.workspaceId}, ${conversationId}, ${ctx.userId}, ${video}) returning *`);
    } catch (error) {
      if (error.code === '23505' || error.cause?.code === '23505') return { call: this.#view(await this.#active(conversationId)), ringing: false }; // raced with someone else's start
      throw error;
    }
    await this.chat.event(ctx, conversationId, 'call', `started:0:${video ? 'video' : 'audio'}`, [call.id]);
    const caller = (await this.chat.people([ctx.userId]))[ctx.userId];
    const targets = await this.chat.memberIds(conversationId, ctx.userId);
    await this.chat.tell(targets, { type: 'call.ring', conversationId, callId: call.id, video, kind: m.kind, title: m.title, from: caller });
    await this.chat.announce(conversationId, { type: 'call.started', call: this.#view(call) });
    return { call: this.#view(call), ringing: true };
  }

  /** A token to enter the call's room. Only members may; the room is the conversation, so being removed from it removes the right to join. */
  async join(ctx, conversationId) {
    this.#assertEnabled();
    await this.chat.member(ctx, conversationId);
    const call = await this.#active(conversationId);
    if (!call) throw new NotFoundError('There is no call in progress');
    if ((call.removed ?? []).includes(ctx.userId)) throw new ForbiddenError('The host removed you from this call');
    const { name } = (await this.chat.people([ctx.userId]))[ctx.userId];
    await this.#rows(sql`update chat_calls set joined = case when joined @> ${JSON.stringify([ctx.userId])}::jsonb then joined else joined || ${JSON.stringify([ctx.userId])}::jsonb end where id = ${call.id}`);
    return {
      call: this.#view(call), url: this.livekit.url, identity: ctx.userId,
      token: await this.livekit.joinToken({ room: conversationId, identity: ctx.userId, name }),
    };
  }

  async decline(ctx, conversationId) {
    await this.chat.member(ctx, conversationId);
    const call = await this.#active(conversationId);
    if (!call) return { ok: true };
    await this.chat.tell([ctx.userId], { type: 'call.dismissed', conversationId, callId: call.id }); // stop ringing on my other devices
    await this.chat.tell([call.started_by], { type: 'call.declined', conversationId, callId: call.id, userId: ctx.userId });
    return { ok: true };
  }

  /** Called after a client disconnects from LiveKit: if nobody is left in the room, the call is over. */
  async leave(ctx, conversationId) {
    await this.chat.member(ctx, conversationId);
    const call = await this.#active(conversationId);
    if (!call) return { ok: true, ended: true };
    const left = (await this.livekit.participants(conversationId).catch(() => [])).filter((id) => id !== ctx.userId);
    if (left.length === 0) await this.#finish(ctx, call);
    return { ok: true, ended: left.length === 0 };
  }

  /** Ends the call for everyone: the person who started it, or a group admin. */
  async end(ctx, conversationId) {
    const m = await this.chat.member(ctx, conversationId);
    const call = await this.#active(conversationId);
    if (!call) return { ok: true };
    if (call.started_by !== ctx.userId && !(m.kind === 'group' && m.role === 'admin')) throw new ForbiddenError('Only the person who started the call or a group admin can end it for everyone');
    await this.#finish(ctx, call, { closeRoom: true });
    return { ok: true };
  }

  /**
   * Host controls: mute one person, mute everyone else, or remove someone (who then cannot rejoin). The host is whoever started the call, or an
   * admin of the group. Everyone else may only control their own devices in the browser.
   */
  async moderate(ctx, conversationId, { action, userId }) {
    this.#assertEnabled();
    const m = await this.chat.member(ctx, conversationId);
    const call = await this.#active(conversationId);
    if (!call) throw new NotFoundError('There is no call in progress');
    if (call.started_by !== ctx.userId && !(m.kind === 'group' && m.role === 'admin')) throw new ForbiddenError('Only the host can do that');
    if (action === 'mute-all') {
      const everyone = await this.livekit.participants(conversationId);
      let muted = 0;
      for (const id of everyone.filter((i) => i !== ctx.userId)) muted += await this.livekit.muteMicrophone(conversationId, id);
      return { ok: true, muted };
    }
    if (!userId || userId === ctx.userId) throw new ValidationError({ userId: 'Choose another participant' });
    if (action === 'mute') return { ok: true, muted: await this.livekit.muteMicrophone(conversationId, userId) };
    await this.#rows(sql`update chat_calls set removed = case when removed @> ${JSON.stringify([userId])}::jsonb then removed else removed || ${JSON.stringify([userId])}::jsonb end where id = ${call.id}`);
    await this.livekit.removeParticipant(conversationId, userId);
    return { ok: true };
  }

  /** LiveKit tells us when a room is finished (everyone gone, even if nobody hung up cleanly): the call is over. */
  async onWebhook(rawBody, authorization) {
    const event = await this.livekit.verifyWebhook(rawBody, authorization);
    if (!event) throw new ForbiddenError('Invalid webhook signature');
    if (event.event === 'room_finished' && event.room?.name) {
      const call = await this.#active(event.room.name);
      if (call) await this.#finish(null, call);
    }
    return { ok: true };
  }

  async config() { return { enabled: this.livekit.enabled }; }

}
