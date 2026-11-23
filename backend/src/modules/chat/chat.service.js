import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7, version as uuidVersion } from 'uuid';
import { CHAT_MAX_GROUP_MEMBERS, dmKeyOf } from '@app/shared';
import { avatarUrl, chatIconUrl } from '../../shared/avatar.js';
import { pgArray } from '../../shared/db/helpers.js';
import { ConflictError, ForbiddenError, NotFoundError, TooManyRequestsError, ValidationError } from '../../shared/errors.js';
import { conversationChannel, userChannel } from './bus.js';

const NIL = '00000000-0000-0000-0000-000000000000';
const CLOCK_SKEW_MS = 10 * 60_000;
const SEND_LIMIT_PER_MINUTE = 240;

const msTimeOfUuidV7 = (id) => parseInt(id.replace(/-/g, '').slice(0, 12), 16);
const personOf = (r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email, jobTitle: r.job_title ?? null, avatar: avatarUrl(r.id, r.avatar_version ?? 0) });

/** A sentence for the inbox preview is built by the UI from these machine bodies (system messages carry actor + targets). */
export const SYSTEM_BODIES = Object.freeze(['created', 'added', 'removed', 'left', 'renamed', 'call']);

/**
 * Conversations and messages. Design rules (see docs/workspace-suite-plan.md):
 *  - every message read is a keyset scan on (conversation_id, id) inside ONE hash partition;
 *  - read state is a per-member cursor, never per-message rows; unread counts are capped range scans from that cursor;
 *  - the message is written once and announced on the bus — nothing is written per recipient;
 *  - client-generated UUIDv7 ids make a retried send idempotent.
 */
export class ChatService {
  constructor({ db, bus, cache, users, drive }) {
    Object.assign(this, { db, bus, cache, users, drive });
  }

  async #rows(query, tx = this.db) { return (await tx.execute(query)).rows; }

  #isAdmin = (ctx) => ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  async #people(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return {};
    const rows = await this.#rows(sql`select id, first_name, last_name, email, job_title, avatar_version from users where id = any(${pgArray(unique, 'uuid')})`);
    return Object.fromEntries(rows.map((r) => [r.id, personOf(r)]));
  }

  async #assertWorkspaceMembers(ctx, ids) {
    const unique = [...new Set(ids)];
    if (!unique.length) return unique;
    const rows = await this.#rows(sql`select user_id from memberships where workspace_id = ${ctx.workspaceId} and user_id = any(${pgArray(unique, 'uuid')})`);
    if (rows.length !== unique.length) throw new ValidationError({ userIds: 'Everyone must be a member of this workspace' });
    return unique;
  }

  /** The caller's active membership of a conversation (this is the ONLY authorisation check chat needs). */
  async member(ctx, conversationId) {
    const [row] = await this.#rows(sql`select m.role, m.last_read_id, c.id, c.kind, c.title, c.legal_hold, c.created_by, c.meeting_at, c.disappear_after
      from chat_members m join chat_conversations c on c.id = m.conversation_id
      where c.workspace_id = ${ctx.workspaceId} and m.conversation_id = ${conversationId} and m.user_id = ${ctx.userId} and m.left_at is null`);
    if (!row) throw new NotFoundError('Conversation not found');
    return row;
  }

  /** Ids of the conversations a person is in (the realtime tier subscribes to exactly these). */
  async conversationIdsOf(workspaceId, userId) {
    const rows = await this.#rows(sql`select conversation_id from chat_members where workspace_id = ${workspaceId} and user_id = ${userId} and left_at is null`);
    return rows.map((r) => r.conversation_id);
  }

  #announce(conversationId, event) { return this.bus.publish(conversationChannel(conversationId), { conversationId, ...event }); }
  #tell(userIds, event) { return Promise.all(userIds.map((id) => this.bus.publish(userChannel(id), event))); }

  #message(r, reactions = [], poll = null) {
    const deleted = Boolean(r.deleted_at);
    return {
      id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, kind: r.kind,
      body: deleted ? '' : r.body, replyTo: r.reply_to, forwarded: r.forwarded,
      attachments: deleted ? [] : r.attachments, mentions: r.mentions,
      editedAt: r.edited_at, deletedAt: r.deleted_at, createdAt: r.created_at, expiresAt: r.expires_at ?? null, starred: Boolean(r.starred),
      ...(poll ? { poll } : {}),
      ...(r.reply_id ? { replyPreview: { id: r.reply_id, senderId: r.reply_sender, body: r.reply_deleted ? '' : String(r.reply_body ?? '').slice(0, 140), deleted: Boolean(r.reply_deleted) } } : {}),
      reactions,
    };
  }

  // ---- inbox ---------------------------------------------------------------------------------------------------------------------

  async inbox(ctx, { archived = false, limit = 50 } = {}) {
    const rows = await this.#rows(sql`
      select c.id, c.kind, c.title, c.description, c.meeting_at, c.legal_hold, c.created_by, c.last_message_id, c.last_message_at, c.created_at, c.disappear_after, c.icon_version,
        m.pinned, m.archived, m.muted_until, m.role, m.last_read_id,
        (select count(*) from (select 1 from chat_messages x where x.conversation_id = c.id and x.id > coalesce(m.last_read_id, ${NIL}::uuid)
          and x.sender_id is distinct from ${ctx.userId} and x.deleted_at is null and x.kind in ('text', 'poll') limit 100) q)::int as unread,
        lm.body as last_body, lm.sender_id as last_sender, lm.kind as last_kind, lm.deleted_at as last_deleted,
        (select count(*) from chat_members cm where cm.conversation_id = c.id and cm.left_at is null)::int as member_count,
        peer.user_id as peer_id,
        exists (select 1 from (select x.mentions from chat_messages x where x.conversation_id = c.id and x.id > coalesce(m.last_read_id, ${NIL}::uuid) and x.deleted_at is null and x.sender_id is distinct from ${ctx.userId} limit 100) q
          where q.mentions @> ${JSON.stringify([ctx.userId])}::jsonb) as mentioned,
        exists (select 1 from chat_calls k where k.conversation_id = c.id and k.ended_at is null) as in_call
      from chat_members m
      join chat_conversations c on c.id = m.conversation_id
      left join chat_messages lm on lm.conversation_id = c.id and lm.id = c.last_message_id
      left join lateral (select p.user_id from chat_members p where p.conversation_id = c.id and p.user_id <> ${ctx.userId} and c.kind = 'dm' limit 1) peer on true
      where m.workspace_id = ${ctx.workspaceId} and m.user_id = ${ctx.userId} and m.left_at is null and m.archived = ${archived}
      order by m.pinned desc, c.last_message_at desc nulls last, c.id desc limit ${limit}`);
    const people = await this.#people(rows.flatMap((r) => [r.peer_id, r.last_sender]));
    return {
      people,
      conversations: rows.map((r) => ({
        id: r.id, kind: r.kind, title: r.title, description: r.description, meetingAt: r.meeting_at, legalHold: r.legal_hold, createdBy: r.created_by,
        peerId: r.peer_id, memberCount: r.member_count, role: r.role, pinned: r.pinned, archived: r.archived, mutedUntil: r.muted_until,
        unread: r.unread, mentioned: r.mentioned, lastReadId: r.last_read_id, createdAt: r.created_at, inCall: r.in_call, disappearAfter: r.disappear_after, icon: chatIconUrl(r.id, r.icon_version),
        last: r.last_message_id ? { id: r.last_message_id, at: r.last_message_at, senderId: r.last_sender, kind: r.last_kind, deleted: r.last_deleted, body: r.last_deleted ? '' : String(r.last_body ?? '').slice(0, 140) } : null,
      })),
    };
  }

  async unreadTotal(ctx) {
    const [row] = await this.#rows(sql`select coalesce(sum(u), 0)::int as total from (
      select (select count(*) from (select 1 from chat_messages x where x.conversation_id = m.conversation_id and x.id > coalesce(m.last_read_id, ${NIL}::uuid)
        and x.sender_id is distinct from ${ctx.userId} and x.deleted_at is null and x.kind in ('text', 'poll') limit 100) q) as u
      from chat_members m where m.workspace_id = ${ctx.workspaceId} and m.user_id = ${ctx.userId} and m.left_at is null and m.archived = false
        and (m.muted_until is null or m.muted_until < now())) t`);
    return { unread: row?.total ?? 0 };
  }

  async get(ctx, conversationId) {
    await this.member(ctx, conversationId);
    const [c] = await this.#rows(sql`select id, kind, title, description, meeting_at, legal_hold, created_by, invite_code, created_at, disappear_after, icon_version from chat_conversations where id = ${conversationId}`);
    const members = await this.#rows(sql`select user_id, role, last_read_id, joined_at from chat_members where conversation_id = ${conversationId} and left_at is null order by joined_at, user_id`);
    const mine = members.find((m) => m.user_id === ctx.userId);
    const [call] = await this.#rows(sql`select id, video, started_by, created_at from chat_calls where conversation_id = ${conversationId} and ended_at is null`);
    const people = await this.#people([...members.map((m) => m.user_id), call?.started_by]);
    const admin = mine.role === 'admin';
    return {
      people,
      conversation: {
        id: c.id, kind: c.kind, title: c.title, description: c.description, meetingAt: c.meeting_at, legalHold: c.legal_hold, createdBy: c.created_by,
        inviteCode: admin ? c.invite_code : null, createdAt: c.created_at, role: mine.role, disappearAfter: c.disappear_after, icon: chatIconUrl(c.id, c.icon_version),
        activeCall: call ? { id: call.id, video: call.video, startedBy: call.started_by, startedAt: call.created_at } : null,
        members: members.map((m) => ({ userId: m.user_id, role: m.role, lastReadId: m.last_read_id })),
      },
    };
  }

  // ---- creating conversations ------------------------------------------------------------------------------------------------

  async createDm(ctx, { userId }) {
    if (userId === ctx.userId) throw new ValidationError({ userId: 'Choose someone else' });
    await this.#assertWorkspaceMembers(ctx, [userId]);
    const key = dmKeyOf(ctx.userId, userId);
    const id = await this.db.transaction(async (tx) => {
      const [made] = await this.#rows(sql`insert into chat_conversations (id, workspace_id, kind, dm_key, created_by) values (${uuidv7()}, ${ctx.workspaceId}, 'dm', ${key}, ${ctx.userId})
        on conflict (workspace_id, dm_key) where dm_key is not null do nothing returning id`, tx);
      const conversationId = made?.id ?? (await this.#rows(sql`select id from chat_conversations where workspace_id = ${ctx.workspaceId} and dm_key = ${key}`, tx))[0].id;
      await this.#rows(sql`insert into chat_members (conversation_id, user_id, workspace_id) values (${conversationId}, ${ctx.userId}, ${ctx.workspaceId}), (${conversationId}, ${userId}, ${ctx.workspaceId})
        on conflict (conversation_id, user_id) do update set left_at = null`, tx);
      return conversationId;
    });
    await this.#tell([ctx.userId, userId], { type: 'conversation.joined', conversationId: id });
    return this.get(ctx, id);
  }

  async createGroup(ctx, { title, description = null, memberIds, meetingAt = null }) {
    const others = (await this.#assertWorkspaceMembers(ctx, memberIds)).filter((id) => id !== ctx.userId);
    if (others.length + 1 > CHAT_MAX_GROUP_MEMBERS) throw new ValidationError({ memberIds: `A group holds at most ${CHAT_MAX_GROUP_MEMBERS} people` });
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      await this.#rows(sql`insert into chat_conversations (id, workspace_id, kind, title, description, created_by, meeting_at) values (${id}, ${ctx.workspaceId}, 'group', ${title}, ${description}, ${ctx.userId}, ${meetingAt})`, tx);
      await this.#rows(sql`insert into chat_members (conversation_id, user_id, workspace_id, role) values (${id}, ${ctx.userId}, ${ctx.workspaceId}, 'admin')`, tx);
      if (others.length) await this.#rows(sql`insert into chat_members (conversation_id, user_id, workspace_id) select ${id}, u, ${ctx.workspaceId} from unnest(${pgArray(others, 'uuid')}) as u`, tx);
    });
    await this.#system(ctx, id, 'created', []);
    await this.#tell([ctx.userId, ...others], { type: 'conversation.joined', conversationId: id });
    return this.get(ctx, id);
  }

  async update(ctx, conversationId, patch) {
    const m = await this.member(ctx, conversationId);
    if (m.kind !== 'group') throw new ValidationError({ conversation: 'Only groups can be edited' });
    if (m.role !== 'admin') throw new ForbiddenError('Only group admins can edit the group');
    await this.#rows(sql`update chat_conversations set
      title = ${patch.title !== undefined ? patch.title : m.title},
      description = case when ${patch.description !== undefined} then ${patch.description ?? null} else description end,
      meeting_at = case when ${patch.meetingAt !== undefined} then ${patch.meetingAt ?? null}::timestamptz else meeting_at end
      where id = ${conversationId}`);
    if (patch.title !== undefined && patch.title !== m.title) await this.#system(ctx, conversationId, 'renamed', []);
    await this.#announce(conversationId, { type: 'conversation.updated' });
    return this.get(ctx, conversationId);
  }

  /** An event line in the conversation (group changes, calls). Never counts as unread. */
  async event(ctx, conversationId, kind, body, targets = []) {
    const id = uuidv7();
    const [row] = await this.#rows(sql`insert into chat_messages (conversation_id, id, workspace_id, sender_id, kind, body, mentions) values (${conversationId}, ${id}, ${ctx.workspaceId}, ${ctx.userId}, ${kind}, ${body}, ${JSON.stringify(targets)}::jsonb) returning *`);
    await this.#rows(sql`update chat_conversations set last_message_id = ${id}, last_message_at = ${row.created_at} where id = ${conversationId}`);
    await this.#announce(conversationId, { type: 'message.new', message: this.#message(row) });
  }

  #system(ctx, conversationId, body, targets) { return this.event(ctx, conversationId, 'system', body, targets); }

  /** Everyone currently in the conversation, except `exceptUserId` (who rings, who is told). */
  async memberIds(conversationId, exceptUserId = null) {
    const rows = await this.#rows(sql`select user_id from chat_members where conversation_id = ${conversationId} and left_at is null and user_id is distinct from ${exceptUserId}`);
    return rows.map((r) => r.user_id);
  }

  announce(conversationId, event) { return this.#announce(conversationId, event); }
  tell(userIds, event) { return this.#tell(userIds, event); }
  people(ids) { return this.#people(ids); }

  // ---- membership --------------------------------------------------------------------------------------------------------------

  async #group(ctx, conversationId, { admin = true } = {}) {
    const m = await this.member(ctx, conversationId);
    if (m.kind !== 'group') throw new ValidationError({ conversation: 'This is a direct conversation' });
    if (admin && m.role !== 'admin') throw new ForbiddenError('Only group admins can do that');
    return m;
  }

  async addMembers(ctx, conversationId, { userIds }) {
    await this.#group(ctx, conversationId);
    const ids = await this.#assertWorkspaceMembers(ctx, userIds);
    const [{ n }] = await this.#rows(sql`select count(*)::int as n from chat_members where conversation_id = ${conversationId} and left_at is null`);
    if (n + ids.length > CHAT_MAX_GROUP_MEMBERS) throw new ValidationError({ userIds: `A group holds at most ${CHAT_MAX_GROUP_MEMBERS} people` });
    const added = await this.#rows(sql`insert into chat_members (conversation_id, user_id, workspace_id) select ${conversationId}, u, ${ctx.workspaceId} from unnest(${pgArray(ids, 'uuid')}) as u
      on conflict (conversation_id, user_id) do update set left_at = null, joined_at = now() where chat_members.left_at is not null returning user_id`);
    if (added.length) {
      const targets = added.map((r) => r.user_id);
      await this.#system(ctx, conversationId, 'added', targets);
      await this.#tell(targets, { type: 'conversation.joined', conversationId });
    }
    return this.get(ctx, conversationId);
  }

  async removeMember(ctx, conversationId, userId) {
    const self = userId === ctx.userId;
    const m = await this.#group(ctx, conversationId, { admin: !self });
    const [gone] = await this.#rows(sql`update chat_members set left_at = now() where conversation_id = ${conversationId} and user_id = ${userId} and left_at is null returning role`);
    if (!gone) throw new NotFoundError('That person is not in this group');
    if (gone.role === 'admin') { // never leave a group without an admin: promote the longest-standing member
      await this.#rows(sql`update chat_members set role = 'admin' where (conversation_id, user_id) = (select conversation_id, user_id from chat_members where conversation_id = ${conversationId} and left_at is null
        and not exists (select 1 from chat_members a where a.conversation_id = ${conversationId} and a.left_at is null and a.role = 'admin') order by joined_at limit 1)`);
    }
    await this.#system(ctx, conversationId, self ? 'left' : 'removed', self ? [] : [userId]);
    await this.#tell([userId], { type: 'conversation.left', conversationId });
    return self ? { ok: true, title: m.title } : this.get(ctx, conversationId);
  }

  async setRole(ctx, conversationId, userId, { role }) {
    await this.#group(ctx, conversationId);
    const [row] = await this.#rows(sql`update chat_members set role = ${role} where conversation_id = ${conversationId} and user_id = ${userId} and left_at is null returning user_id`);
    if (!row) throw new NotFoundError('That person is not in this group');
    const [{ n }] = await this.#rows(sql`select count(*)::int as n from chat_members where conversation_id = ${conversationId} and left_at is null and role = 'admin'`);
    if (n === 0) { await this.#rows(sql`update chat_members set role = 'admin' where conversation_id = ${conversationId} and user_id = ${userId}`); throw new ConflictError('A group needs at least one admin'); }
    await this.#announce(conversationId, { type: 'conversation.updated' });
    return this.get(ctx, conversationId);
  }

  async createInvite(ctx, conversationId) {
    await this.#group(ctx, conversationId);
    const code = randomBytes(12).toString('base64url');
    await this.#rows(sql`update chat_conversations set invite_code = ${code} where id = ${conversationId}`);
    return { inviteCode: code };
  }

  async revokeInvite(ctx, conversationId) {
    await this.#group(ctx, conversationId);
    await this.#rows(sql`update chat_conversations set invite_code = null where id = ${conversationId}`);
    return { inviteCode: null };
  }

  async joinByInvite(ctx, code) {
    const [c] = await this.#rows(sql`select id from chat_conversations where workspace_id = ${ctx.workspaceId} and invite_code = ${code} and kind = 'group'`);
    if (!c) throw new NotFoundError('That invite link is no longer valid');
    const [{ n }] = await this.#rows(sql`select count(*)::int as n from chat_members where conversation_id = ${c.id} and left_at is null`);
    if (n >= CHAT_MAX_GROUP_MEMBERS) throw new ConflictError('This group is full');
    const [row] = await this.#rows(sql`insert into chat_members (conversation_id, user_id, workspace_id) values (${c.id}, ${ctx.userId}, ${ctx.workspaceId})
      on conflict (conversation_id, user_id) do update set left_at = null, joined_at = now() where chat_members.left_at is not null returning user_id`);
    if (row) { await this.#system(ctx, c.id, 'added', [ctx.userId]); await this.#tell([ctx.userId], { type: 'conversation.joined', conversationId: c.id }); }
    return this.get(ctx, c.id);
  }

  async setState(ctx, conversationId, patch) {
    await this.member(ctx, conversationId);
    await this.#rows(sql`update chat_members set
      pinned = case when ${patch.pinned !== undefined} then ${patch.pinned ?? false} else pinned end,
      archived = case when ${patch.archived !== undefined} then ${patch.archived ?? false} else archived end,
      muted_until = case when ${patch.mutedUntil !== undefined} then ${patch.mutedUntil ?? null}::timestamptz else muted_until end
      where conversation_id = ${conversationId} and user_id = ${ctx.userId}`);
    await this.#tell([ctx.userId], { type: 'conversation.state', conversationId });
    return { ok: true };
  }

  /** Compliance: only workspace owners/admins can freeze a conversation. While held, nothing in it can be deleted or edited-for-everyone. */
  async setLegalHold(ctx, conversationId, on) {
    if (!this.#isAdmin(ctx)) throw new ForbiddenError('Only workspace admins can place a legal hold');
    const [row] = await this.#rows(sql`update chat_conversations set legal_hold = ${on} where id = ${conversationId} and workspace_id = ${ctx.workspaceId} returning id`);
    if (!row) throw new NotFoundError('Conversation not found');
    await this.#announce(conversationId, { type: 'conversation.updated' });
    return { legalHold: on };
  }

  // ---- messages --------------------------------------------------------------------------------------------------------------

  async #reactionsFor(conversationId, messageIds, userId) {
    if (!messageIds.length) return new Map();
    const rows = await this.#rows(sql`select message_id, emoji, count(*)::int as n, bool_or(user_id = ${userId}) as mine from chat_reactions
      where conversation_id = ${conversationId} and message_id = any(${pgArray(messageIds, 'uuid')}) group by message_id, emoji order by min(created_at)`);
    const map = new Map();
    for (const r of rows) map.set(r.message_id, [...(map.get(r.message_id) ?? []), { emoji: r.emoji, count: r.n, mine: r.mine }]);
    return map;
  }

  #visible = (ctx, alias = 'm') => sql`(${sql.raw(alias)}.expires_at is null or ${sql.raw(alias)}.expires_at > now()) and not exists (select 1 from chat_hidden h where h.user_id = ${ctx.userId} and h.conversation_id = ${sql.raw(alias)}.conversation_id and h.message_id = ${sql.raw(alias)}.id)`;
  #starredFlag = (ctx, alias = 'm') => sql`exists (select 1 from chat_stars s where s.user_id = ${ctx.userId} and s.conversation_id = ${sql.raw(alias)}.conversation_id and s.message_id = ${sql.raw(alias)}.id) as starred`;

  /** Vote counts (and the caller's own votes) for the polls among these message rows. */
  async #pollResults(conversationId, rows, userId) {
    const polls = rows.filter((r) => r.poll);
    if (!polls.length) return new Map();
    const ids = polls.map((r) => r.id);
    const votes = await this.#rows(sql`select message_id, option, count(*)::int as n, bool_or(user_id = ${userId}) as mine from chat_poll_votes where conversation_id = ${conversationId} and message_id = any(${pgArray(ids, 'uuid')}) group by message_id, option`);
    const voters = await this.#rows(sql`select message_id, count(distinct user_id)::int as n from chat_poll_votes where conversation_id = ${conversationId} and message_id = any(${pgArray(ids, 'uuid')}) group by message_id`);
    const voterCount = new Map(voters.map((v) => [v.message_id, v.n]));
    return new Map(polls.map((r) => [r.id, {
      multi: Boolean(r.poll.multi), voters: voterCount.get(r.id) ?? 0,
      options: r.poll.options.map((text, i) => { const v = votes.find((x) => x.message_id === r.id && x.option === i); return { text, votes: v?.n ?? 0, mine: Boolean(v?.mine) }; }),
    }]));
  }

  async messages(ctx, conversationId, { before, after, limit }) {
    await this.member(ctx, conversationId);
    const where = before ? sql`and m.id < ${before}` : after ? sql`and m.id > ${after}` : sql``;
    const rows = await this.#rows(sql`select m.*, ${this.#starredFlag(ctx)}, r.id as reply_id, r.sender_id as reply_sender, r.body as reply_body, r.deleted_at is not null as reply_deleted
      from chat_messages m left join chat_messages r on r.conversation_id = m.conversation_id and r.id = m.reply_to
      where m.conversation_id = ${conversationId} and ${this.#visible(ctx)} ${where} order by m.id ${after ? sql`asc` : sql`desc`} limit ${limit + 1}`);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    if (!after) page.reverse();
    const [reactions, polls] = await Promise.all([this.#reactionsFor(conversationId, page.map((r) => r.id), ctx.userId), this.#pollResults(conversationId, page, ctx.userId)]);
    const people = await this.#people(page.flatMap((r) => [r.sender_id, r.reply_sender]));
    return { messages: page.map((r) => this.#message(r, reactions.get(r.id) ?? [], polls.get(r.id))), hasMore, people };
  }

  async #loadMessage(conversationId, id, userId) {
    const [row] = await this.#rows(sql`select m.*, ${this.#starredFlag({ userId })}, r.id as reply_id, r.sender_id as reply_sender, r.body as reply_body, r.deleted_at is not null as reply_deleted
      from chat_messages m left join chat_messages r on r.conversation_id = m.conversation_id and r.id = m.reply_to where m.conversation_id = ${conversationId} and m.id = ${id}`);
    if (!row) throw new NotFoundError('Message not found');
    return this.#message(row, (await this.#reactionsFor(conversationId, [id], userId)).get(id) ?? [], (await this.#pollResults(conversationId, [row], userId)).get(id));
  }

  #expiry = (m) => (m.disappear_after ? sql`now() + ${m.disappear_after} * interval '1 second'` : sql`null`);

  async send(ctx, conversationId, input) {
    const m = await this.member(ctx, conversationId);
    if (!this.cache.allow(`chat:${ctx.workspaceId}`, 60, 20_000) || (await this.cache.hit(`chat-w:${ctx.workspaceId}:${ctx.userId}`, 60)) > SEND_LIMIT_PER_MINUTE) throw new TooManyRequestsError(60);
    let id = input.id;
    if (id) {
      if (uuidVersion(id) !== 7 || Math.abs(msTimeOfUuidV7(id) - Date.now()) > CLOCK_SKEW_MS) throw new ValidationError({ id: 'Use a UUIDv7 generated now' });
    } else id = uuidv7();

    let { body } = input; let attachments = []; let forwarded = false;
    if (input.forwardOf) {
      await this.member(ctx, input.forwardOf.conversationId); // you can only forward what you can read
      const [src] = await this.#rows(sql`select body, attachments, deleted_at from chat_messages where conversation_id = ${input.forwardOf.conversationId} and id = ${input.forwardOf.messageId} and kind = 'text'`);
      if (!src || src.deleted_at) throw new NotFoundError('The message to forward no longer exists');
      body = src.body; forwarded = true;
      if (src.attachments?.length) { // forwarding copies the files into this conversation's own folder (the source folder is private to its members)
        const folderId = await this.drive.chatFolderId(ctx, conversationId);
        attachments = [];
        for (const a of src.attachments) { const { file } = await this.drive.copyFile(ctx, a.id, { folderId, name: a.name }); attachments.push({ id: file.id, name: file.name, mime: file.mime, size: file.size }); }
      }
    }
    if (input.replyTo) {
      const [reply] = await this.#rows(sql`select 1 as ok from chat_messages where conversation_id = ${conversationId} and id = ${input.replyTo}`);
      if (!reply) throw new ValidationError({ replyTo: 'The message you are replying to no longer exists' });
    }
    const mentions = input.mentions?.length
      ? (await this.#rows(sql`select user_id from chat_members where conversation_id = ${conversationId} and left_at is null and user_id = any(${pgArray(input.mentions, 'uuid')})`)).map((r) => r.user_id)
      : [];
    if (input.attachments?.length) attachments = await this.drive.chatFileMeta(ctx, conversationId, input.attachments);

    const [row] = await this.#rows(sql`insert into chat_messages (conversation_id, id, workspace_id, sender_id, kind, body, reply_to, forwarded, attachments, mentions, expires_at)
      values (${conversationId}, ${id}, ${ctx.workspaceId}, ${ctx.userId}, 'text', ${body}, ${input.replyTo ?? null}, ${forwarded}, ${JSON.stringify(attachments)}::jsonb, ${JSON.stringify(mentions)}::jsonb, ${this.#expiry(m)})
      on conflict (conversation_id, id) do nothing returning id`);
    const message = await this.#loadMessage(conversationId, id, ctx.userId);
    if (!row) return { message, duplicate: true }; // a retry of something already stored: no second broadcast
    await this.#rows(sql`update chat_conversations set last_message_id = ${id}, last_message_at = ${message.createdAt} where id = ${conversationId} and (last_message_id is null or last_message_id < ${id})`);
    await this.#rows(sql`update chat_members set last_read_id = ${id} where conversation_id = ${conversationId} and user_id = ${ctx.userId} and (last_read_id is null or last_read_id < ${id})`);
    await this.#announce(conversationId, { type: 'message.new', message, sender: (await this.#people([ctx.userId]))[ctx.userId] });
    return { message, duplicate: false };
  }

  async edit(ctx, conversationId, messageId, { body }) {
    const m = await this.member(ctx, conversationId);
    if (m.legal_hold) throw new ConflictError('LEGAL_HOLD: this conversation is frozen');
    const [row] = await this.#rows(sql`update chat_messages set body = ${body}, edited_at = now() where conversation_id = ${conversationId} and id = ${messageId} and sender_id = ${ctx.userId} and kind = 'text' and deleted_at is null returning id`);
    if (!row) throw new NotFoundError('You can only edit your own messages');
    const message = await this.#loadMessage(conversationId, messageId, ctx.userId);
    await this.#announce(conversationId, { type: 'message.updated', message });
    return { message };
  }

  async remove(ctx, conversationId, messageId) {
    const m = await this.member(ctx, conversationId);
    if (m.legal_hold) throw new ConflictError('LEGAL_HOLD: this conversation is frozen');
    const [row] = await this.#rows(sql`update chat_messages set deleted_at = now(), body = '', attachments = '[]'::jsonb where conversation_id = ${conversationId} and id = ${messageId} and kind in ('text', 'poll') and deleted_at is null
      and (sender_id = ${ctx.userId} or ${m.kind === 'group' && m.role === 'admin'}) returning id`);
    if (!row) throw new NotFoundError('You can only delete your own messages');
    await this.#rows(sql`delete from chat_pins where conversation_id = ${conversationId} and message_id = ${messageId}`);
    const message = await this.#loadMessage(conversationId, messageId, ctx.userId);
    await this.#announce(conversationId, { type: 'message.updated', message });
    return { message };
  }

  async react(ctx, conversationId, messageId, { emoji }) {
    await this.member(ctx, conversationId);
    const [exists] = await this.#rows(sql`select 1 as ok from chat_messages where conversation_id = ${conversationId} and id = ${messageId} and deleted_at is null and kind = 'text'`);
    if (!exists) throw new NotFoundError('Message not found');
    const removed = await this.#rows(sql`delete from chat_reactions where conversation_id = ${conversationId} and message_id = ${messageId} and user_id = ${ctx.userId} and emoji = ${emoji} returning emoji`);
    if (!removed.length) await this.#rows(sql`insert into chat_reactions (conversation_id, message_id, user_id, emoji) values (${conversationId}, ${messageId}, ${ctx.userId}, ${emoji}) on conflict do nothing`);
    await this.#announce(conversationId, { type: 'reaction', messageId, userId: ctx.userId, emoji, on: !removed.length });
    return { on: !removed.length };
  }

  async pin(ctx, conversationId, messageId) {
    await this.member(ctx, conversationId);
    const [exists] = await this.#rows(sql`select 1 as ok from chat_messages where conversation_id = ${conversationId} and id = ${messageId} and deleted_at is null and kind = 'text'`);
    if (!exists) throw new NotFoundError('Message not found');
    const removed = await this.#rows(sql`delete from chat_pins where conversation_id = ${conversationId} and message_id = ${messageId} returning message_id`);
    if (!removed.length) await this.#rows(sql`insert into chat_pins (conversation_id, message_id, pinned_by) values (${conversationId}, ${messageId}, ${ctx.userId}) on conflict do nothing`);
    await this.#announce(conversationId, { type: 'pins.changed' });
    return { pinned: !removed.length };
  }

  async pins(ctx, conversationId) {
    await this.member(ctx, conversationId);
    const rows = await this.#rows(sql`select m.* from chat_pins p join chat_messages m on m.conversation_id = p.conversation_id and m.id = p.message_id
      where p.conversation_id = ${conversationId} and m.deleted_at is null order by p.created_at desc limit 50`);
    return { messages: rows.map((r) => this.#message(r)), people: await this.#people(rows.map((r) => r.sender_id)) };
  }

  /** Moves the caller's read cursor forward (never back) and tells the other members' devices. */
  async markRead(ctx, conversationId, { messageId }) {
    await this.member(ctx, conversationId);
    const rows = await this.#rows(sql`update chat_members set last_read_id = ${messageId} where conversation_id = ${conversationId} and user_id = ${ctx.userId} and (last_read_id is null or last_read_id < ${messageId}) returning last_read_id`);
    if (rows.length) await this.#announce(conversationId, { type: 'read', userId: ctx.userId, lastReadId: messageId });
    return { ok: true };
  }

  // ---- starring, delete for me, disappearing messages, polls, message info, group admin --------------------------------------------

  async star(ctx, conversationId, messageId, { on }) {
    await this.member(ctx, conversationId);
    if (on) {
      const [exists] = await this.#rows(sql`select 1 as ok from chat_messages where conversation_id = ${conversationId} and id = ${messageId} and deleted_at is null and kind in ('text', 'poll')`);
      if (!exists) throw new NotFoundError('Message not found');
      await this.#rows(sql`insert into chat_stars (user_id, conversation_id, message_id) values (${ctx.userId}, ${conversationId}, ${messageId}) on conflict do nothing`);
    } else await this.#rows(sql`delete from chat_stars where user_id = ${ctx.userId} and conversation_id = ${conversationId} and message_id = ${messageId}`);
    return { starred: on };
  }

  /** Your starred messages across every conversation you are still in, newest first. */
  async starred(ctx, { before, limit }) {
    const older = before ? sql`and s.message_id < ${before}` : sql``;
    const rows = await this.#rows(sql`select m.*, true as starred, c.kind as conv_kind, c.title as conv_title,
        (select p.user_id from chat_members p where p.conversation_id = c.id and p.user_id <> ${ctx.userId} and c.kind = 'dm' limit 1) as peer_id
      from chat_stars s
      join chat_messages m on m.conversation_id = s.conversation_id and m.id = s.message_id
      join chat_conversations c on c.id = s.conversation_id
      join chat_members me on me.conversation_id = c.id and me.user_id = ${ctx.userId} and me.left_at is null
      where s.user_id = ${ctx.userId} and m.deleted_at is null and ${this.#visible(ctx)} ${older} order by s.message_id desc limit ${limit + 1}`);
    const page = rows.slice(0, limit);
    return {
      people: await this.#people(page.flatMap((r) => [r.sender_id, r.peer_id])),
      items: page.map((r) => ({ message: this.#message(r), conversation: { id: r.conversation_id, kind: r.conv_kind, title: r.conv_title, peerId: r.peer_id } })),
      nextBefore: rows.length > limit ? page.at(-1).id : null,
    };
  }

  /** "Delete for me": hides a message from the caller's own view only. Works under legal hold (nothing is destroyed). */
  async hideForMe(ctx, conversationId, messageId) {
    await this.member(ctx, conversationId);
    await this.#rows(sql`insert into chat_hidden (user_id, conversation_id, message_id) values (${ctx.userId}, ${conversationId}, ${messageId}) on conflict do nothing`);
    await this.#rows(sql`delete from chat_stars where user_id = ${ctx.userId} and conversation_id = ${conversationId} and message_id = ${messageId}`);
    return { ok: true };
  }

  /** Disappearing messages: from now on, new messages in this conversation vanish after `seconds` (0 = off). Anyone in a DM; admins in a group. */
  async setDisappearing(ctx, conversationId, { seconds }) {
    const m = await this.member(ctx, conversationId);
    if (m.kind === 'group' && m.role !== 'admin') throw new ForbiddenError('Only group admins can change this');
    await this.#rows(sql`update chat_conversations set disappear_after = ${seconds || null} where id = ${conversationId}`);
    await this.#system(ctx, conversationId, `disappearing:${seconds}`, []);
    await this.#announce(conversationId, { type: 'conversation.updated' });
    return { disappearAfter: seconds || null };
  }

  async createPoll(ctx, conversationId, { id: clientId, question, options, multi }) {
    const m = await this.member(ctx, conversationId);
    if (!this.cache.allow(`chat:${ctx.workspaceId}`, 60, 20_000) || (await this.cache.hit(`chat-w:${ctx.workspaceId}:${ctx.userId}`, 60)) > SEND_LIMIT_PER_MINUTE) throw new TooManyRequestsError(60);
    const id = clientId ?? uuidv7();
    const [row] = await this.#rows(sql`insert into chat_messages (conversation_id, id, workspace_id, sender_id, kind, body, poll, expires_at)
      values (${conversationId}, ${id}, ${ctx.workspaceId}, ${ctx.userId}, 'poll', ${question}, ${JSON.stringify({ options, multi })}::jsonb, ${this.#expiry(m)}) on conflict (conversation_id, id) do nothing returning id`);
    const message = await this.#loadMessage(conversationId, id, ctx.userId);
    if (!row) return { message, duplicate: true };
    await this.#rows(sql`update chat_conversations set last_message_id = ${id}, last_message_at = ${message.createdAt} where id = ${conversationId} and (last_message_id is null or last_message_id < ${id})`);
    await this.#rows(sql`update chat_members set last_read_id = ${id} where conversation_id = ${conversationId} and user_id = ${ctx.userId} and (last_read_id is null or last_read_id < ${id})`);
    await this.#announce(conversationId, { type: 'message.new', message, sender: (await this.#people([ctx.userId]))[ctx.userId] });
    return { message, duplicate: false };
  }

  /** Replaces the caller's vote(s) on a poll (an empty list withdraws the vote). */
  async vote(ctx, conversationId, messageId, { options }) {
    await this.member(ctx, conversationId);
    const [msg] = await this.#rows(sql`select id, poll from chat_messages where conversation_id = ${conversationId} and id = ${messageId} and kind = 'poll' and deleted_at is null`);
    if (!msg) throw new NotFoundError('Poll not found');
    const chosen = [...new Set(options)];
    if (chosen.some((o) => o >= msg.poll.options.length)) throw new ValidationError({ options: 'Choose one of the options' });
    if (!msg.poll.multi && chosen.length > 1) throw new ValidationError({ options: 'Choose one option' });
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`delete from chat_poll_votes where conversation_id = ${conversationId} and message_id = ${messageId} and user_id = ${ctx.userId}`);
      if (chosen.length) await tx.execute(sql`insert into chat_poll_votes (conversation_id, message_id, user_id, option) select ${conversationId}, ${messageId}, ${ctx.userId}, o from unnest(${pgArray(chosen, 'int')}) as o`);
    });
    const poll = (await this.#pollResults(conversationId, [msg], ctx.userId)).get(messageId);
    await this.#announce(conversationId, { type: 'poll.updated', messageId, userId: ctx.userId, counts: poll.options.map((o) => o.votes), voters: poll.voters });
    return { poll };
  }

  /** Who has read a message you sent (read state is a per-person cursor, so this is exact for reads; delivery is not tracked). */
  async messageInfo(ctx, conversationId, messageId) {
    await this.member(ctx, conversationId);
    const [msg] = await this.#rows(sql`select sender_id, created_at from chat_messages where conversation_id = ${conversationId} and id = ${messageId}`);
    if (!msg) throw new NotFoundError('Message not found');
    if (msg.sender_id !== ctx.userId) throw new ForbiddenError('Only the sender can see who read a message');
    const members = await this.#rows(sql`select user_id, last_read_id from chat_members where conversation_id = ${conversationId} and left_at is null and user_id <> ${ctx.userId}`);
    const read = members.filter((x) => x.last_read_id && x.last_read_id >= messageId).map((x) => x.user_id);
    const pending = members.filter((x) => !x.last_read_id || x.last_read_id < messageId).map((x) => x.user_id);
    return { readBy: read, pending, sentAt: msg.created_at, people: await this.#people([...read, ...pending]) };
  }

  /** For routes that act on a group's settings (the icon): the caller must be an admin of a group. */
  groupAdmin(ctx, conversationId) { return this.#group(ctx, conversationId); }

  // ---- shared media, documents, links, groups in common (the info panel) ---------------------------------------------------------

  /** Photos/videos, documents or links shared in the conversation, newest first. Uses the partial indexes on messages that have attachments / links. */
  async shared(ctx, conversationId, { type, before, limit }) {
    await this.member(ctx, conversationId);
    const older = before ? sql`and m.id < ${before}` : sql``;
    const kind = type === 'links'
      ? sql`m.body ~ 'https?://'`
      : type === 'media'
        ? sql`jsonb_array_length(m.attachments) > 0 and exists (select 1 from jsonb_array_elements(m.attachments) a where a->>'mime' ~ '^(image|video)/')`
        : sql`jsonb_array_length(m.attachments) > 0 and exists (select 1 from jsonb_array_elements(m.attachments) a where a->>'mime' !~ '^(image|video)/')`;
    const rows = await this.#rows(sql`select m.id, m.sender_id, m.body, m.attachments, m.created_at from chat_messages m
      where m.conversation_id = ${conversationId} and ${kind} and m.deleted_at is null and m.kind = 'text' ${older} order by m.id desc limit ${limit + 1}`);
    const page = rows.slice(0, limit);
    const isMedia = (a) => /^(image|video)\//.test(a.mime);
    const items = page.flatMap((r) => {
      const base = { messageId: r.id, senderId: r.sender_id, createdAt: r.created_at };
      if (type === 'links') return [...new Set(r.body.match(/https?:\/\/[^\s<>]+[^\s<>.,;:!?)\]'"]/g) ?? [])].map((url) => ({ ...base, url, text: r.body.slice(0, 200) }));
      return r.attachments.filter((a) => (type === 'media') === isMedia(a)).map((file) => ({ ...base, file }));
    });
    return { items, nextBefore: rows.length > limit ? page.at(-1).id : null, people: await this.#people(page.map((r) => r.sender_id)) };
  }

  /** Groups both you and this person are in. */
  async commonGroups(ctx, userId) {
    const rows = await this.#rows(sql`select c.id, c.title, (select count(*) from chat_members x where x.conversation_id = c.id and x.left_at is null)::int as members
      from chat_conversations c
      join chat_members a on a.conversation_id = c.id and a.user_id = ${ctx.userId} and a.left_at is null
      join chat_members b on b.conversation_id = c.id and b.user_id = ${userId} and b.left_at is null
      where c.workspace_id = ${ctx.workspaceId} and c.kind = 'group' order by c.last_message_at desc nulls last limit 50`);
    return { groups: rows.map((r) => ({ id: r.id, title: r.title, members: r.members })) };
  }

  // ---- search ----------------------------------------------------------------------------------------------------------------

  /** Full-text search across the conversations the caller belongs to (GIN on the generated tsvector; the last word matches as a prefix). */
  async search(ctx, { q, conversationId, limit }) {
    const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!words.length) return { results: [], people: {} };
    const tsquery = words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(' & ');
    const scope = conversationId ? sql`and conversation_id = ${conversationId}` : sql``;
    const rows = await this.#rows(sql`select m.conversation_id, m.id, m.sender_id, m.body, m.created_at, c.kind, c.title
      from chat_messages m join chat_conversations c on c.id = m.conversation_id
      where m.workspace_id = ${ctx.workspaceId} and m.tsv @@ to_tsquery('simple', ${tsquery}) and m.deleted_at is null and m.kind = 'text'
        and m.conversation_id in (select conversation_id from chat_members where workspace_id = ${ctx.workspaceId} and user_id = ${ctx.userId} and left_at is null ${scope})
      order by m.id desc limit ${limit}`);
    const dmPeers = new Map();
    const dms = [...new Set(rows.filter((r) => r.kind === 'dm').map((r) => r.conversation_id))];
    if (dms.length) for (const r of await this.#rows(sql`select conversation_id, user_id from chat_members where conversation_id = any(${pgArray(dms, 'uuid')}) and user_id <> ${ctx.userId}`)) dmPeers.set(r.conversation_id, r.user_id);
    const people = await this.#people([...rows.map((r) => r.sender_id), ...dmPeers.values()]);
    return {
      people,
      results: rows.map((r) => ({ conversationId: r.conversation_id, messageId: r.id, senderId: r.sender_id, body: r.body.slice(0, 200), createdAt: r.created_at, kind: r.kind, title: r.title, peerId: dmPeers.get(r.conversation_id) ?? null })),
    };
  }
}
