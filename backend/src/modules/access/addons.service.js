import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';

const key = (ws, userId) => `${ws}:${userId}`;
const list = (values) => sql.join(values.map((v) => sql`${v}`), sql`, `);

/**
 * Permission-set add-ons: extra access assigned to a person on top of their role and profile.
 *
 * Built for very large workspaces (10 M people):
 *  - A person's sets are ONE primary-key prefix lookup, memoised in a bounded in-process map (`peek` is synchronous and allocation-free),
 *    so the access check stays far below a millisecond once warm. A write drops the entry on this worker; other workers pick it up
 *    within `ttlMs` (the same <= 5 s convergence the rest of the access cache has).
 *  - Nothing here loads "every assignment in the workspace" — that is the pattern this replaces for new assignments.
 *  - Counts are exact and never capped. They accept several conditions at once (see `count`).
 *
 * `createAccessAddons({ enabled })` returns null when the feature is off: nothing is constructed, routed, queried or shown.
 */
export function createAccessAddons({ enabled, ...deps }) {
  return enabled ? new AccessAddonsService(deps) : null;
}

class AccessAddonsService {
  #map = new Map();
  #inflight = new Map();

  constructor({ db, cache, repos, seed, ttlMs = 5_000, max = 500_000 }) { Object.assign(this, { db, cache, repos, seed, ttlMs, max }); }

  /** Synchronous fast path: the person's sets if they are in memory and fresh, else undefined. */
  peek(ws, userId) {
    const hit = this.#map.get(key(ws, userId));
    return hit && hit.until > Date.now() ? hit.sets : undefined;
  }

  /** The person's permission-set names (cached). */
  async setsFor(ws, userId) {
    const fast = this.peek(ws, userId);
    if (fast) return fast;
    const k = key(ws, userId);
    const running = this.#inflight.get(k);
    if (running) return running;
    const task = (async () => {
      const { rows } = await this.db.execute(sql`select permission_set from user_permission_sets where workspace_id = ${ws} and user_id = ${userId}::uuid`);
      const sets = rows.map((r) => r.permission_set);
      if (this.#map.size >= this.max) this.#map.delete(this.#map.keys().next().value); // oldest first; bounded memory at any workspace size
      this.#map.set(k, { sets, until: Date.now() + this.ttlMs });
      return sets;
    })().finally(() => this.#inflight.delete(k));
    this.#inflight.set(k, task);
    return task;
  }

  /** Names a person can be given: every Object Settings container that is not a profile. */
  catalogue(ws) {
    return this.cache.rememberValue(`r:${ws}:object-settings`, 'addons-catalogue', { ttlMs: 30_000 }, async () => { // same namespace as the grants: editing Object Settings refreshes it
      await this.seed(ws, 'object-settings');
      await this.seed(ws, 'profiles');
      const { rows } = await this.db.execute(sql`
        select distinct data->>'permission_set' as name from setup_records
        where workspace_id = ${ws} and collection = 'object-settings' and coalesce(data->>'permission_set', '') <> ''
          and data->>'permission_set' not in (select label from setup_records where workspace_id = ${ws} and collection = 'profiles')
        order by 1`);
      return rows.map((r) => r.name);
    });
  }

  /** Catalogue with how many people hold each set (exact, uncapped). */
  async catalogueWithCounts(ws) {
    const [names, counts] = await Promise.all([
      this.catalogue(ws),
      this.db.execute(sql`select permission_set, count(*)::int as n from user_permission_sets where workspace_id = ${ws} group by 1`),
    ]);
    const by = new Map(counts.rows.map((r) => [r.permission_set, r.n]));
    return names.map((name) => ({ name, users: by.get(name) ?? 0 }));
  }

  async list(ws, userId) {
    const { rows } = await this.db.execute(sql`select permission_set as name, created_at as "assignedAt" from user_permission_sets where workspace_id = ${ws} and user_id = ${userId}::uuid order by permission_set`);
    return rows;
  }

  async #member(ws, userId) {
    const { rows } = await this.db.execute(sql`select u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ${ws} and m.user_id = ${userId}::uuid`);
    if (!rows.length) throw new NotFoundError('That person is not a member of this workspace');
    return rows[0].email;
  }

  async #changed(ws, userId) {
    this.#map.delete(key(ws, userId));
    await this.cache.bump(`search:${ws}`); // what someone may open decides what they may find
  }

  /** Nobody widens (or narrows) their own access — someone else does it, and it is audited. */
  #notSelf(ctx, userId) { if (userId === ctx.userId) throw new ForbiddenError('You cannot change your own access', 'SELF_ACCESS_CHANGE'); }

  async assign(ctx, userId, name) {
    this.#notSelf(ctx, userId);
    const email = await this.#member(ctx.workspaceId, userId);
    if (!(await this.catalogue(ctx.workspaceId)).includes(name)) throw new ValidationError([{ field: 'name', message: `No permission set named “${name}”` }]);
    const { rowCount } = await this.db.execute(sql`insert into user_permission_sets (workspace_id, user_id, permission_set, assigned_by) values (${ctx.workspaceId}, ${userId}::uuid, ${name}, ${ctx.userId}) on conflict do nothing`);
    await this.#changed(ctx.workspaceId, userId);
    if (rowCount) await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, 'users', 'update', `Added permission set “${name}” to ${email}`);
    return this.list(ctx.workspaceId, userId);
  }

  async unassign(ctx, userId, name) {
    this.#notSelf(ctx, userId);
    const email = await this.#member(ctx.workspaceId, userId);
    const { rowCount } = await this.db.execute(sql`delete from user_permission_sets where workspace_id = ${ctx.workspaceId} and user_id = ${userId}::uuid and permission_set = ${name}`);
    await this.#changed(ctx.workspaceId, userId);
    if (rowCount) await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, 'users', 'update', `Removed permission set “${name}” from ${email}`);
    return this.list(ctx.workspaceId, userId);
  }

  /**
   * Exact member count for any combination of conditions — no cap. Every condition is optional and they all apply together (AND);
   * a condition with several values matches any of them (OR within it).
   *   role: ['manager', …]   profile: […]   noProfile: true   permissionSet: […] (has any)   noPermissionSet: true   q: 'text in name or email'
   */
  async count(ws, { role, profile, noProfile, permissionSet, noPermissionSet, q } = {}) {
    const where = [sql`m.workspace_id = ${ws}`];
    if (role?.length) where.push(sql`m.role in (${list(role)})`);
    if (profile?.length && noProfile) where.push(sql`(m.profile in (${list(profile)}) or m.profile is null)`);
    else if (profile?.length) where.push(sql`m.profile in (${list(profile)})`);
    else if (noProfile) where.push(sql`m.profile is null`);
    if (permissionSet?.length) where.push(sql`exists (select 1 from user_permission_sets ps where ps.workspace_id = m.workspace_id and ps.user_id = m.user_id and ps.permission_set = any(${pgArray(permissionSet, 'text')}))`);
    if (noPermissionSet) where.push(sql`not exists (select 1 from user_permission_sets ps where ps.workspace_id = m.workspace_id and ps.user_id = m.user_id)`);
    if (q) where.push(sql`exists (select 1 from users u where u.id = m.user_id and lower(u.first_name || ' ' || u.last_name || ' ' || u.email) like ${`%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`})`);
    const { rows } = await this.db.execute(sql`select count(*)::bigint as n from memberships m where ${sql.join(where, sql` and `)}`);
    return Number(rows[0].n);
  }
}
