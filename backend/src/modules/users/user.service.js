import { NotFoundError } from '../../shared/errors.js';
import { toPublicUser } from './userPresenter.js';

export class UserService {
  constructor({ repos, cache }) { Object.assign(this, { repos, cache }); }

  /** Email of a user, cached (used to stamp record owners and match approvers on hot paths). */
  emailOf(userId) {
    return this.cache.rememberValue(`user:${userId}`, 'email', { ttlMs: 300_000 }, async () => (await this.repos.users.findById(userId))?.email ?? null);
  }

  async me(userId, activeTenantId, impersonatedBy = null, activeWorkspaceId = null) {
    const [user, tenants, workspaces] = await Promise.all([
      this.repos.users.findById(userId), this.repos.memberships.listTenantsForUser(userId),
      activeTenantId ? this.repos.workspaces.forUser(activeTenantId, userId) : [],
    ]);
    if (!user) throw new NotFoundError('User not found');
    return { user: toPublicUser(user), tenants, activeTenantId: activeTenantId ?? null, workspaces, activeWorkspaceId: workspaces.some((w) => w.id === activeWorkspaceId) ? activeWorkspaceId : null, impersonatedBy };
  }

  /** Personal UI preferences (theme mode): merged into the stored object so unrelated preferences are kept. */
  async updatePreferences(userId, patch) {
    const user = await this.repos.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    return toPublicUser(await this.repos.users.update(userId, { preferences: { ...(user.preferences ?? {}), ...patch } }));
  }

  async updateProfile(userId, input) {
    return toPublicUser(await this.repos.users.update(userId, input));
  }
}
