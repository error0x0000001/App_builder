import { ForbiddenError } from '../../shared/errors.js';

const yes = (v) => String(v).toLowerCase() === 'yes';
const ACTIONS = ['read', 'create', 'edit', 'delete'];
const ALL = 'All';
/** What a role may do when no Setup grant covers the object. */
const BASELINE = { viewer: { read: true }, member: { read: true, create: true, edit: true }, admin: { read: true, create: true, edit: true, delete: true }, owner: { read: true, create: true, edit: true, delete: true } };
const SHARING = { Private: 'private', 'Public Read Only': 'read', 'Public Read/Write': 'write', 'Public Read/Write/Transfer': 'write', 'Public Full Access': 'write', 'Controlled by Parent': 'write' };
const ownerKey = (def) => def.fields.find((f) => /owner/.test(f.key))?.key;

/**
 * Who may read / create / edit / delete which object, and which records they see.
 *   Grants   — Object Settings rows (object, permission set, Yes/No per action) attach to a container name:
 *              the user's Profile, or any permission set assigned to them in Manage Assignments. Union wins.
 *   Fallback — no grant covers the object → the workspace role's baseline (viewer read, member read/write, admin all).
 *   Sharing  — Organization-Wide Defaults per object: Private = own records only, Public Read Only = everyone reads but only
 *              owners edit, Public Read/Write = open. Admins and owners see everything.
 * Rule lists are cached and versioned per Setup collection, so changing a profile applies on the next request on every worker.
 */
export class AccessService {
  constructor({ automation, cache, seed }) { Object.assign(this, { automation, cache, seed }); } // seed(ws, collectionKey): loads a collection's built-in rows once

  #index(ws) {
    return this.cache.rememberValue(`r:${ws}:object-settings`, 'grants', { ttlMs: 30_000 }, async () => {
      await this.seed(ws, 'object-settings'); // the standard profiles' grants are structural: they must exist before anyone is checked
      const byContainer = {};
      for (const r of await this.automation.rules(ws, 'object-settings')) {
        const flags = Object.fromEntries(ACTIONS.map((a) => [a, yes(r.data[a])]));
        ((byContainer[r.data.permission_set] ??= {})[r.data.object] ??= {}); // ensure shape
        Object.assign(byContainer[r.data.permission_set][r.data.object], flags);
      }
      return byContainer;
    });
  }

  #assignments(ws) {
    return this.cache.rememberValue(`r:${ws}:manage-assignments`, 'by-user', { ttlMs: 30_000 }, async () => {
      const byUser = {};
      for (const r of await this.automation.rules(ws, 'manage-assignments')) (byUser[String(r.data.user).toLowerCase()] ??= []).push(r.data.permission_set);
      return byUser;
    });
  }

  #sharing(ws) {
    return this.cache.rememberValue(`r:${ws}:sharing-defaults`, 'owd', { ttlMs: 30_000 }, async () => {
      await this.seed(ws, 'sharing-defaults');
      return Object.fromEntries((await this.automation.rules(ws, 'sharing-defaults')).map((r) => [r.data.object, SHARING[r.data.default_internal_access] ?? 'write']));
    });
  }

  /** Effective permissions on one object for the actor, plus how records are scoped. `ctx.actor === null` = system (public intake). */
  async forObject(ctx, def) {
    if (!ctx.actor) return { read: true, create: true, edit: true, delete: false, scope: 'all' };
    const { role, profile } = ctx.actor;
    const admin = role === 'owner' || role === 'admin';
    const [grants, assigned, sharing] = await Promise.all([this.#index(ctx.workspaceId), this.#assignments(ctx.workspaceId), this.#sharing(ctx.workspaceId)]);
    const containers = [profile, ...(assigned[String(ctx.email ?? '').toLowerCase()] ?? [])].filter(Boolean);
    const covering = containers.map((c) => grants[c]?.[def.key] ?? grants[c]?.[ALL]).filter(Boolean);
    const base = BASELINE[role] ?? BASELINE.viewer;
    const perms = Object.fromEntries(ACTIONS.map((a) => [a, covering.length ? covering.some((g) => g[a]) : Boolean(base[a])]));
    const owd = sharing[def.key] ?? 'write';
    return { ...perms, scope: admin || owd === 'write' ? 'all' : owd === 'read' ? 'read-all' : 'own', ownerKey: ownerKey(def) };
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
