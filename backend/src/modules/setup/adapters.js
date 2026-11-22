import { ROLES, ROLE_LABELS, parseUserAgent } from '@app/shared';
import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { decodeCursor, encodeCursor } from '../../shared/pagination.js';

const roleFromLabel = (label) => ROLES.find((r) => ROLE_LABELS[r] === label);
const PROFILE = { owner: 'System Administrator', admin: 'System Administrator', member: 'Standard User', viewer: 'Read Only' };

/**
 * Adapters expose real platform tables through the same list contract as record-backed pages:
 *   list(ctx, { limit, after }) -> { items, nextCursor };  create/update/remove as the page allows.
 */
export function createSetupAdapters({ db, workspaces, invitations, sessions, repos, seedProfiles }) {
  const users = {
    async list(ctx, { limit, after }) {
      const { items, nextCursor } = await workspaces.listMembers(ctx.workspaceId, { limit, after });
      return {
        nextCursor,
        items: items.map((m) => ({
          id: m.userId, full_name: `${m.firstName} ${m.lastName}`, alias: m.email.split('@')[0], username: m.email, email: m.email,
          role: ROLE_LABELS[m.role], active: true, profile: m.profile ?? PROFILE[m.role], createdAt: m.joinedAt,
        })),
      };
    },
    async create(ctx, { email, role }) {
      const [result] = await invitations.inviteMany({ actor: ctx.actor, workspaceId: ctx.workspaceId, invitations: [{ email: email.toLowerCase(), role: roleFromLabel(role ?? 'Member') ?? 'member' }] });
      if (result.status !== 'sent') throw new ValidationError(undefined, result.reason ?? 'Could not invite this person');
      return { id: email, email, username: email, role: role ?? 'Member', active: false, full_name: `${email} (invited)` };
    },
    async update(ctx, id, { role, profile }) {
      if (role !== undefined) {
        const next = roleFromLabel(role);
        if (!next) throw new ValidationError(undefined, 'Unknown role');
        await workspaces.changeRole({ actor: ctx.actor, workspaceId: ctx.workspaceId, targetUserId: id, role: next });
      }
      if (profile !== undefined) {
        const name = profile.trim();
        if (name) { // must be an existing Setup profile
          await seedProfiles(ctx.workspaceId);
          if (!(await repos.setupRecords.findByLabel(ctx.workspaceId, 'profiles', name))) throw new ValidationError([{ field: 'profile', message: `No profile named “${name}”` }]);
        }
        await workspaces.setProfile({ actor: ctx.actor, workspaceId: ctx.workspaceId, targetUserId: id, profile: name || null });
      }
      return { id, role, profile };
    },
    async remove(ctx, ids) {
      for (const targetUserId of ids) await workspaces.removeMember({ actor: ctx.actor, workspaceId: ctx.workspaceId, targetUserId });
      return ids.length;
    },
  };

  const loginHistory = {
    async list(ctx, { limit, after }) {
      const cursor = decodeCursor(after)?.id;
      const { rows } = await db.execute(sql`
        select e.id, e.type, e.ip, e.user_agent, e.created_at, u.email
        from auth_events e left join users u on u.id = e.user_id
        where e.workspace_id = ${ctx.workspaceId} and e.type = 'login_success' ${cursor ? sql`and e.id < ${cursor}::uuid` : sql``}
        order by e.id desc limit ${limit + 1}`);
      return {
        nextCursor: rows.length > limit ? encodeCursor({ id: rows[limit - 1].id }) : null,
        items: rows.slice(0, limit).map((r) => {
          const ua = parseUserAgent(r.user_agent ?? '');
          return { id: r.id, username: r.email ?? '—', login_time: r.created_at, source_ip: r.ip ?? '—', location: '—', login_type: 'Application', status: 'Success', browser: ua.browser, platform: ua.os, application: 'Browser' };
        }),
      };
    },
  };

  const sessionManagement = {
    async list(ctx, { limit, after }) {
      const c = decodeCursor(after);
      const { rows } = await db.execute(sql`
        select s.id, s.ip, s.created_at, s.last_used_at, u.email from sessions s join users u on u.id = s.user_id
        where s.workspace_id = ${ctx.workspaceId} and s.revoked_at is null and s.expires_at > now()
          ${c ? sql`and (s.last_used_at, s.id) < (${c.t}::timestamptz, ${c.id}::uuid)` : sql``}
        order by s.last_used_at desc, s.id desc limit ${limit + 1}`);
      return {
        nextCursor: rows.length > limit ? encodeCursor({ t: rows[limit - 1].last_used_at, id: rows[limit - 1].id }) : null,
        items: rows.slice(0, limit).map((r) => ({ id: r.id, username: r.email, session_type: 'UI', source_ip: r.ip ?? '—', login_time: r.created_at, last_activity: r.last_used_at })),
      };
    },
    async remove(ctx, ids) {
      const { rowCount } = await db.execute(sql`update sessions set revoked_at = now(), revoked_reason = 'admin_revoked' where workspace_id = ${ctx.workspaceId} and id = any(${pgArray(ids, 'uuid')}) and revoked_at is null`);
      if (!rowCount) throw new NotFoundError('Session not found');
      return rowCount;
    },
  };

  const auditTrail = {
    async list(ctx, { limit, after }) {
      const cursor = decodeCursor(after)?.id;
      const rows = await repos.setupAudit.list(ctx.workspaceId, { limit: limit + 1, after: cursor });
      return {
        nextCursor: rows.length > limit ? encodeCursor({ id: rows[limit - 1].id }) : null,
        items: rows.slice(0, limit).map((r) => ({ id: r.id, date: r.created_at, user: r.email ?? '—', source_namespace_prefix: '', action: r.summary, section: r.page_key, delegate_user: '' })),
      };
    },
  };

  /** Real schedules registered with the job queue (cleanup, case escalation). Read-only. */
  const scheduledJobs = {
    async list() {
      const { rows } = await db.execute(sql`select name, cron, timezone, created_on from pgboss.schedule order by name`).catch((e) => (e.cause?.code === '42P01' || e.code === '42P01' ? { rows: [] } : Promise.reject(e))); // queue schema not created yet
      return { nextCursor: null, items: rows.map((r) => ({ id: r.name, action: '', job_name: r.name, submitted_by: 'System', submitted: r.created_on, started: '—', next_scheduled_run: `cron ${r.cron} (${r.timezone})`, type: 'Scheduled job' })) };
    },
  };

  return { 'scheduled-jobs': scheduledJobs, users, 'login-history': loginHistory, 'session-management': sessionManagement, 'view-setup-audit-trail': auditTrail };
}
