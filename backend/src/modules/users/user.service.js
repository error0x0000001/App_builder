import { NotFoundError } from '../../shared/errors.js';
import { toPublicUser } from './userPresenter.js';

export class UserService {
  constructor({ repos }) { this.repos = repos; }

  async me(userId, activeWorkspaceId) {
    const [user, workspaces] = await Promise.all([this.repos.users.findById(userId), this.repos.memberships.listWorkspacesForUser(userId)]);
    if (!user) throw new NotFoundError('User not found');
    return { user: toPublicUser(user), workspaces, activeWorkspaceId: activeWorkspaceId ?? null };
  }

  async updateProfile(userId, input) {
    return toPublicUser(await this.repos.users.update(userId, input));
  }
}
