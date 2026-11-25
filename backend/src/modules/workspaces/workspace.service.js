import { slugify } from '@app/shared';
import { randomToken } from '../../shared/security/crypto.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';

/** Workspaces inside a tenant and who is assigned to them. Configuration stays tenant-wide; this only decides where people work. */
export class WorkspaceService {
  constructor({ repos, uow }) { Object.assign(this, { repos, uow }); }

  /** Called when a tenant is created (inside its transaction): the first workspace carries the tenant's name. */
  async createDefault(repos, { tenantId, name }) {
    return repos.workspaces.create({ tenantId, name, slug: 'main', isDefault: true });
  }

  /** Called when someone joins a tenant: they land in the default workspace (or the ones the inviter picked). */
  async assignOnJoin(repos, { tenantId, userId, workspaceIds }) {
    const targets = workspaceIds?.length ? workspaceIds : [(await repos.workspaces.defaultOf(tenantId)).id];
    for (const id of targets) {
      const workspace = await repos.workspaces.find(tenantId, id);
      if (workspace && !workspace.archivedAt) await repos.workspaces.assign(tenantId, id, userId);
    }
  }

  list(tenantId, { archived = false } = {}) { return this.repos.workspaces.list(tenantId, { archived }); }
  mine(tenantId, userId) { return this.repos.workspaces.forUser(tenantId, userId); }

  /** The workspace a session should work in: the current one while still assigned, otherwise the person's default. */
  async resolveFor(tenantId, userId, preferredId) {
    const mine = await this.repos.workspaces.forUser(tenantId, userId);
    return mine.find((w) => w.id === preferredId) ?? mine.find((w) => w.isDefault) ?? mine[0] ?? null;
  }

  async create({ tenantId, actorId, name }) {
    const clean = name.trim();
    const workspace = await this.uow.run(async (repos) => {
      const created = await repos.workspaces.create({ tenantId, name: clean, slug: await this.#uniqueSlug(repos, tenantId, clean) }).catch(this.#nameConflict);
      await repos.workspaces.assign(tenantId, created.id, actorId); // whoever creates it can use it
      return created;
    });
    await this.repos.auditLog.record(tenantId, actorId, 'workspaces', 'create', `Created workspace ${workspace.name}`);
    return workspace;
  }

  async rename({ tenantId, actorId, id, name }) {
    await this.#require(tenantId, id);
    const updated = await this.repos.workspaces.update(tenantId, id, { name: name.trim() }).catch(this.#nameConflict);
    await this.repos.auditLog.record(tenantId, actorId, 'workspaces', 'rename', `Renamed workspace to ${updated.name}`);
    return updated;
  }

  async archive({ tenantId, actorId, id }) {
    const workspace = await this.#require(tenantId, id);
    if (workspace.isDefault) throw new ConflictError('The default workspace can’t be archived');
    await this.repos.workspaces.archive(tenantId, id);
    await this.repos.auditLog.record(tenantId, actorId, 'workspaces', 'archive', `Archived workspace ${workspace.name}`);
  }

  async restore({ tenantId, actorId, id }) {
    const workspace = await this.#require(tenantId, id);
    await this.repos.workspaces.restore(tenantId, id);
    await this.repos.auditLog.record(tenantId, actorId, 'workspaces', 'restore', `Restored workspace ${workspace.name}`);
  }

  members(tenantId, id) { return this.#require(tenantId, id).then(() => this.repos.workspaces.members(tenantId, id)); }

  /** Sets the complete list of workspaces a person may use (at least one, none archived). Admins use it from the user's page. */
  async setAssignments({ tenantId, actorId, userId, workspaceIds }) {
    if (!(await this.repos.memberships.find(tenantId, userId))) throw new NotFoundError('Member not found');
    const wanted = [...new Set(workspaceIds)];
    if (!wanted.length) throw new ValidationError('A person needs at least one workspace');
    const live = new Map((await this.repos.workspaces.list(tenantId)).map((w) => [w.id, w]));
    const unknown = wanted.filter((id) => !live.has(id));
    if (unknown.length) throw new ValidationError('Unknown or archived workspace');
    await this.uow.run(async (repos) => {
      const current = await repos.workspaces.idsFor(tenantId, userId);
      for (const id of wanted) if (!current.includes(id)) await repos.workspaces.assign(tenantId, id, userId);
      for (const id of current) if (!wanted.includes(id)) await repos.workspaces.unassign(tenantId, id, userId);
    });
    await this.repos.auditLog.record(tenantId, actorId, 'workspaces', 'assign', `Changed workspaces of a member (${wanted.length})`);
    return this.repos.workspaces.forUser(tenantId, userId);
  }

  async assignmentsOf(tenantId, userId) {
    if (!(await this.repos.memberships.find(tenantId, userId))) throw new NotFoundError('Member not found');
    return this.repos.workspaces.idsFor(tenantId, userId);
  }

  async #require(tenantId, id) {
    const workspace = await this.repos.workspaces.find(tenantId, id);
    if (!workspace) throw new NotFoundError('Workspace not found');
    return workspace;
  }

  #nameConflict(error) {
    if (error?.code === '23505' || error?.cause?.code === '23505') throw new ConflictError('A workspace with that name already exists');
    throw error;
  }

  async #uniqueSlug(repos, tenantId, name) {
    const base = slugify(name).slice(0, 40) || 'workspace';
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${randomToken(2).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`.slice(0, 48);
      if (!(await repos.workspaces.slugExists(tenantId, candidate))) return candidate;
    }
    throw new ConflictError('Could not allocate a workspace URL, please retry');
  }
}
