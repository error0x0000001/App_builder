import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';

const key = (tenantId, userId) => `${tenantId}:${userId}`;
const list = (values) => sql.join(values.map((v) => sql`${v}`), sql`, `);

/**
 * Permission-set add-ons: extra access assigned to a person on top of their role and profile.
 *
 * Built for very large tenants (10 M people):
 *  - A person's sets are ONE primary-key prefix lookup, memoised in a bounded in-process map (`peek` is synchronous and allocation-free),
 *    so the access check stays far below a millisecond once warm. A write drops the entry on this worker; other workers pick it up
 *    within `ttlMs` (the same <= 5 s convergence the rest of the access cache has).
 *  - Nothing here loads "every assignment in the tenant".
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

  constructor({ db, repos, changed = async () => {}, ttlMs = 5_000, max = 500_000 }) { Object.assign(this, { db, repos, changed, ttlMs, max }); }

  /** Synchronous fast path: the ids of the person's permission sets if they are in memory and fresh, else undefined. */
  peek(tenantId, userId) {
    const hit = this.#map.get(key(tenantId, userId));
    return hit && hit.until > Date.now() ? hit.ids : undefined;
  }

  async setIdsFor(tenantId, userId) {
    const fast = this.peek(tenantId, userId);
    if (fast) return fast;
    const k = key(tenantId, userId);
    const running = this.#inflight.get(k);
    if (running) return running;
    const task = (async () => {
      const ids = await this.repos.access.assignedSetIds(tenantId, userId);
      if (this.#map.size >= this.max) this.#map.delete(this.#map.keys().next().value); // oldest first; bounded memory at any tenant size
      this.#map.set(k, { ids, until: Date.now() + this.ttlMs });
      return ids;
    })().finally(() => this.#inflight.delete(k));
    this.#inflight.set(k, task);
    return task;
  }

  /** Every permission set of the tenant with how many people hold it (exact, uncapped). */
  async catalogueWithCounts(tenantId) {
    return (await this.repos.access.listPermissionSets(tenantId)).map((s) => ({ id: s.id, name: s.name, users: s.users }));
  }

  list(tenantId, userId) { return this.repos.access.setsOfUser(tenantId, userId); }

  async #member(tenantId, userId) {
    const { rows } = await this.db.execute(sql`select u.email from memberships m join users u on u.id = m.user_id where m.tenant_id = ${tenantId} and m.user_id = ${userId}::uuid`);
    if (!rows.length) throw new NotFoundError('That person is not a member of this organisation');
    return rows[0].email;
  }

  async #afterChange(tenantId, userId) {
    this.#map.delete(key(tenantId, userId));
    await this.changed(tenantId); // what someone may open decides what they may find
  }

  /** Nobody widens (or narrows) their own access — someone else does it, and it is audited. */
  #notSelf(ctx, userId) { if (userId === ctx.userId) throw new ForbiddenError('You cannot change your own access', 'SELF_ACCESS_CHANGE'); }

  async assign(ctx, userId, name) {
    this.#notSelf(ctx, userId);
    const email = await this.#member(ctx.tenantId, userId);
    const set = await this.repos.access.permissionSetByName(ctx.tenantId, name);
    if (!set) throw new ValidationError([{ field: 'name', message: `No permission set named “${name}”` }]);
    const added = await this.repos.access.assign(ctx.tenantId, set.id, userId, ctx.userId);
    await this.#afterChange(ctx.tenantId, userId);
    if (added) await this.repos.auditLog.record(ctx.tenantId, ctx.userId, 'users', 'update', `Added permission set “${set.name}” to ${email}`);
    return this.list(ctx.tenantId, userId);
  }

  async unassign(ctx, userId, name) {
    this.#notSelf(ctx, userId);
    const email = await this.#member(ctx.tenantId, userId);
    const set = await this.repos.access.permissionSetByName(ctx.tenantId, name);
    const removed = set ? await this.repos.access.unassign(ctx.tenantId, set.id, userId) : 0;
    await this.#afterChange(ctx.tenantId, userId);
    if (removed) await this.repos.auditLog.record(ctx.tenantId, ctx.userId, 'users', 'update', `Removed permission set “${set.name}” from ${email}`);
    return this.list(ctx.tenantId, userId);
  }

  /**
   * Exact member count for any combination of conditions — no cap. Every condition is optional and they all apply together (AND);
   * a condition with several values matches any of them (OR within it).
   *   role: ['member', …]   profile: ['Standard User', …]   noProfile: true   permissionSet: […] (has any)   noPermissionSet: true   q: 'text in name or email'
   */
  async count(tenantId, { role, profile, noProfile, permissionSet, noPermissionSet, q } = {}) {
    const where = [sql`m.tenant_id = ${tenantId}`];
    const profileIds = (names) => sql`(select id from profiles where tenant_id = ${tenantId} and name = any(${pgArray(names, 'text')}))`;
    if (role?.length) where.push(sql`m.role in (${list(role)})`);
    if (profile?.length && noProfile) where.push(sql`(m.profile_id in ${profileIds(profile)} or m.profile_id is null)`);
    else if (profile?.length) where.push(sql`m.profile_id in ${profileIds(profile)}`);
    else if (noProfile) where.push(sql`m.profile_id is null`);
    if (permissionSet?.length) where.push(sql`exists (select 1 from permission_set_assignments a join permission_sets s on s.id = a.permission_set_id where a.tenant_id = m.tenant_id and a.user_id = m.user_id and s.name = any(${pgArray(permissionSet, 'text')}))`);
    if (noPermissionSet) where.push(sql`not exists (select 1 from permission_set_assignments a where a.tenant_id = m.tenant_id and a.user_id = m.user_id)`);
    if (q) where.push(sql`exists (select 1 from users u where u.id = m.user_id and lower(u.first_name || ' ' || u.last_name || ' ' || u.email) like ${`%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`})`);
    const { rows } = await this.db.execute(sql`select count(*)::bigint as n from memberships m where ${sql.join(where, sql` and `)}`);
    return Number(rows[0].n);
  }
}
