import { ROLE_LABELS, parseUserAgent } from '@app/shared';
import { sql } from 'drizzle-orm';
import { avatarUrl } from '../../shared/avatar.js';
import { pgArray } from '../../shared/db/helpers.js';
import { NotFoundError } from '../../shared/errors.js';

const PROFILE_BY_ROLE = { owner: 'System Administrator', admin: 'System Administrator', member: 'Standard User', viewer: 'Read Only' };
const device = (ua) => { const p = parseUserAgent(ua ?? ''); return { browser: p.browser ?? 'Unknown browser', os: p.os ?? 'Unknown system' }; };

/** Everything the "user details" page shows about one member of this workspace — their access, devices, sign-ins and the Setup changes they made. */
export class UserDetailsService {
  constructor({ db, repos, cache, addons = null }) { Object.assign(this, { db, repos, cache, addons }); }

  async get(ws, userId) {
    const { rows } = await this.db.execute(sql`
      select u.id, u.first_name, u.last_name, u.email, u.avatar_version, u.created_at as user_since, u.email_verified_at, u.mfa_enabled, u.status,
             m.role, m.profile, m.created_at as joined_at
      from memberships m join users u on u.id = m.user_id where m.workspace_id = ${ws} and m.user_id = ${userId}::uuid`);
    const u = rows[0];
    if (!u) throw new NotFoundError('That person is not a member of this workspace');
    const [sessions, logins, changes, counts] = await Promise.all([
      this.db.execute(sql`select id, ip, user_agent, created_at, last_used_at from sessions where workspace_id = ${ws} and user_id = ${userId}::uuid and revoked_at is null and expires_at > now() order by last_used_at desc limit 20`),
      this.db.execute(sql`select id, ip, user_agent, created_at from auth_events where workspace_id = ${ws} and user_id = ${userId}::uuid and type = 'login_success' order by id desc limit 8`),
      this.db.execute(sql`select id, page_key, action, summary, created_at from setup_audit where workspace_id = ${ws} and user_id = ${userId}::uuid order by id desc limit 8`),
      this.db.execute(sql`select (select count(*)::int from setup_audit where workspace_id = ${ws} and user_id = ${userId}::uuid) as changes, (select max(created_at) from auth_events where workspace_id = ${ws} and user_id = ${userId}::uuid and type = 'login_success') as last_login`),
    ]);
    const name = `${u.first_name} ${u.last_name}`.trim();
    const permissionSets = this.addons ? await this.addons.list(ws, userId) : undefined; // undefined = feature off: the field is simply absent
    return {
      permissionSets,
      user: {
        id: u.id, name, firstName: u.first_name, lastName: u.last_name, email: u.email, avatar: avatarUrl(u.id, u.avatar_version ?? 0),
        role: u.role, roleLabel: ROLE_LABELS[u.role], profile: u.profile ?? PROFILE_BY_ROLE[u.role], joinedAt: u.joined_at, userSince: u.user_since,
        emailVerified: Boolean(u.email_verified_at), mfaEnabled: u.mfa_enabled, active: u.status === 'active', lastLogin: counts.rows[0].last_login, changeCount: counts.rows[0].changes,
      },
      sessions: sessions.rows.map((s) => ({ id: s.id, ip: s.ip ?? '—', createdAt: s.created_at, lastUsedAt: s.last_used_at, ...device(s.user_agent) })),
      logins: logins.rows.map((l) => ({ id: l.id, ip: l.ip ?? '—', at: l.created_at, ...device(l.user_agent) })),
      changes: changes.rows.map((c) => ({ id: c.id, pageKey: c.page_key, action: c.action, summary: c.summary, at: c.created_at })),
    };
  }

  /** Ends this person's sessions in this workspace (all, or the given ones) and records it in the audit trail. */
  async signOut(ctx, userId, ids) {
    const member = await this.db.execute(sql`select 1 from memberships where workspace_id = ${ctx.workspaceId} and user_id = ${userId}::uuid`);
    if (!member.rows.length) throw new NotFoundError('That person is not a member of this workspace');
    const { rowCount } = await this.db.execute(sql`
      update sessions set revoked_at = now(), revoked_reason = 'admin_revoked'
      where workspace_id = ${ctx.workspaceId} and user_id = ${userId}::uuid and revoked_at is null ${ids?.length ? sql`and id = any(${pgArray(ids, 'uuid')})` : sql``}`);
    await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, 'users', 'update', `Signed a user out of ${rowCount} session${rowCount === 1 ? '' : 's'}`);
    await this.cache.bump(`m:${ctx.workspaceId}`);
    return rowCount;
  }
}
