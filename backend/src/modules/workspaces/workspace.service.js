import { isReservedSlug, slugify } from '@app/shared';
import { randomToken } from '../../shared/security/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { decodeCursor, encodeCursor, paginate } from '../../shared/pagination.js';
import { assertCanManageMember } from './permissions.js';

export class WorkspaceService {
  constructor({ repos, uow, sessions }) { Object.assign(this, { repos, uow, sessions }); }

  /** Creates a workspace and its owner membership using the given repos (so callers can compose it into a transaction). */
  async createWithOwner(repos, { name, userId, teamSize }) {
    const workspace = await repos.workspaces.create({ name, slug: await this.#uniqueSlug(repos, name), teamSize, createdBy: userId });
    await repos.memberships.add({ workspaceId: workspace.id, userId, role: 'owner' });
    return workspace;
  }

  create(userId, { name }) { return this.uow.run((repos) => this.createWithOwner(repos, { name, userId })); }
  listForUser(userId) { return this.repos.memberships.listWorkspacesForUser(userId); }

  async lookupBySlug(slug) {
    const workspace = await this.repos.workspaces.findBySlug(slug);
    if (!workspace) throw new NotFoundError('We couldn’t find that workspace');
    return { name: workspace.name, slug: workspace.slug };
  }

  async get(workspaceId) {
    const workspace = await this.repos.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundError('Workspace not found');
    return workspace;
  }

  async completeOnboarding(workspaceId, data) {
    await this.repos.workspaces.update(workspaceId, data);
    await this.repos.workspaces.markOnboarded(workspaceId);
    return this.get(workspaceId);
  }

  async updateTheme(workspaceId, theme) {
    await this.repos.workspaces.update(workspaceId, { theme });
    return this.get(workspaceId);
  }

  async listMembers(workspaceId, { limit, after }) {
    const page = await paginate(
      (n) => this.repos.memberships.listMembers(workspaceId, { limit: n, after: decodeCursor(after) }),
      limit,
      (last) => encodeCursor({ createdAt: last.cursorTs, userId: last.userId }),
    );
    return { ...page, items: page.items.map(({ cursorTs, ...member }) => member) };
  }

  async changeRole({ actor, workspaceId, targetUserId, role }) {
    const target = await this.#requireMember(workspaceId, targetUserId);
    assertCanManageMember({ actorRole: actor.role, targetRole: target.role, newRole: role });
    if (target.role === 'owner' && role !== 'owner') await this.#assertNotLastOwner(workspaceId);
    return this.repos.memberships.updateRole(workspaceId, targetUserId, role);
  }

  async removeMember({ actor, workspaceId, targetUserId }) {
    const target = await this.#requireMember(workspaceId, targetUserId);
    assertCanManageMember({ actorRole: actor.role, targetRole: target.role });
    if (target.role === 'owner') await this.#assertNotLastOwner(workspaceId);
    await this.repos.memberships.remove(workspaceId, targetUserId);
  }

  async leave({ userId, workspaceId }) {
    const membership = await this.#requireMember(workspaceId, userId);
    if (membership.role === 'owner') await this.#assertNotLastOwner(workspaceId);
    await this.repos.memberships.remove(workspaceId, userId);
  }

  async #requireMember(workspaceId, userId) {
    const membership = await this.repos.memberships.find(workspaceId, userId);
    if (!membership) throw new NotFoundError('Member not found');
    return membership;
  }

  async #assertNotLastOwner(workspaceId) {
    if ((await this.repos.memberships.countOwners(workspaceId)) <= 1) throw new ConflictError('A workspace needs at least one owner');
  }

  async #uniqueSlug(repos, name) {
    const base = slugify(name) || 'workspace';
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = attempt === 0 && base.length >= 3 && !isReservedSlug(base) ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`.slice(0, 40);
      if (!(await repos.workspaces.slugExists(candidate))) return candidate;
    }
    throw new ConflictError('Could not allocate a workspace URL, please retry');
  }
}
