import { ForbiddenError } from '../../shared/errors.js';

const ACTIONS = ['read', 'create', 'edit', 'delete'];
const ALL = 'All';
const NONE = Object.freeze([]);
/** What a role may do when no profile or permission set covers the object. */
const BASELINE = { viewer: { read: true }, member: { read: true, create: true, edit: true }, admin: { read: true, create: true, edit: true, delete: true }, owner: { read: true, create: true, edit: true, delete: true } };
const SHARING = { Private: 'private', 'Public Read Only': 'read', 'Public Read/Write': 'write', 'Public Read/Write/Transfer': 'write', 'Public Full Access': 'write', 'Controlled by Parent': 'write' };
const flagsOf = (r) => ({ read: r.can_read, create: r.can_create, edit: r.can_edit, delete: r.can_delete });
export const accessNamespace = (tenantId) => `access:${tenantId}`;

/**
 * Who may read / create / edit / delete which object, and which records they see — computed from real tables.
 *   Grants   — object_permissions rows attach to a profile or a permission set. A person has one profile (memberships.profile_id) and any
 *              number of permission sets (permission_set_assignments); the union of everything covering the object wins.
 *   Fallback — nothing covers the object → the role's baseline (viewer reads, member reads and writes, admin and owner everything).
 *   Sharing  — sharing_defaults per object: Private = own records only, Public Read Only = everyone reads but only owners edit,
 *              Public Read/Write = open. Admins and owners see everything.
 * Grants and sharing are cached per tenant and refreshed when `changed(tenantId)` is called (every worker sees it within the cache TTL).
 */
export class AccessService {
  constructor({ repos, cache, addons = null }) { Object.assign(this, { repos, cache, addons }); } // addons: permission-set assignments on a person (null = feature off)

  #grants(tenantId) {
    return this.cache.rememberValue(accessNamespace(tenantId), 'grants', { ttlMs: 30_000 }, async () => {
      const byGrantee = new Map();
      for (const r of await this.repos.access.allGrants(tenantId)) {
        const id = r.profile_id ?? r.permission_set_id;
        if (!byGrantee.has(id)) byGrantee.set(id, new Map());
        byGrantee.get(id).set(r.object_key, flagsOf(r));
      }
      return byGrantee;
    });
  }

  #sharing(tenantId) {
    return this.cache.rememberValue(accessNamespace(tenantId), 'sharing', { ttlMs: 30_000 }, async () => new Map((await this.repos.access.sharingOverrides(tenantId)).map((r) => [r.object_key, SHARING[r.internal_access] ?? 'write'])));
  }

  /** Call after any change to grants, assignments, profiles or sharing so the next check sees it. */
  changed(tenantId) { return this.cache.bump(accessNamespace(tenantId)); }

  /** Effective permissions on one object for the actor, plus how records are scoped. `ctx.actor === null` = the system (public intake). */
  async forObject(ctx, objectKey, { ownerKey } = {}) {
    if (!ctx.actor) return { read: true, create: true, edit: true, delete: false, scope: 'all' };
    const { role, profileId } = ctx.actor;
    const admin = role === 'owner' || role === 'admin';
    const [grants, sharing] = await Promise.all([this.#grants(ctx.tenantId), this.#sharing(ctx.tenantId)]);
    const sets = this.addons && ctx.userId ? (this.addons.peek(ctx.tenantId, ctx.userId) ?? await this.addons.setIdsFor(ctx.tenantId, ctx.userId)) : NONE;
    const covering = [profileId, ...sets].filter(Boolean).map((id) => grants.get(id)?.get(objectKey) ?? grants.get(id)?.get(ALL)).filter(Boolean);
    const base = BASELINE[role] ?? BASELINE.viewer;
    const perms = Object.fromEntries(ACTIONS.map((a) => [a, covering.length ? covering.some((g) => g[a]) : Boolean(base[a])]));
    const owd = sharing.get(objectKey) ?? 'write';
    return { ...perms, scope: admin || owd === 'write' ? 'all' : owd === 'read' ? 'read-all' : 'own', ownerKey };
  }

  assert(perms, action) {
    if (!perms[action]) throw new ForbiddenError(`You don't have permission to ${action} these records`);
  }

  /** True when the actor may change this record under the sharing model (owner, or open, or admin). */
  mayChange(perms, ctx, data) {
    if (perms.scope === 'all') return true;
    return Boolean(perms.ownerKey && ctx.email && String(data[perms.ownerKey] ?? '').toLowerCase() === ctx.email.toLowerCase());
  }
}
