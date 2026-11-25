import { isReservedSlug, slugify } from '@app/shared';
import { randomToken } from '../../shared/security/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { decodeCursor, encodeCursor, paginate } from '../../shared/pagination.js';
import { assertCanManageMember } from './permissions.js';

export class TenantService {
  constructor({ repos, uow, sessions, membershipLookup, workspaces }) { Object.assign(this, { repos, uow, sessions, membershipLookup, workspaces }); }

  /** Creates an organisation and its owner membership using the given repos (so callers can compose it into a transaction). */
  async createWithOwner(repos, { name, userId, teamSize }) {
    const tenant = await repos.tenants.create({ name, slug: await this.#uniqueSlug(repos, name), teamSize, createdBy: userId });
    await repos.memberships.add({ tenantId: tenant.id, userId, role: 'owner' });
    await this.workspaces.createDefault(repos, { tenantId: tenant.id, name: tenant.name });
    await this.workspaces.assignOnJoin(repos, { tenantId: tenant.id, userId });
    await repos.access.provision(tenant.id, tenant.name); // standard profiles and grants, the role hierarchy's top node, default security policies
    return tenant;
  }

  create(userId, { name }) { return this.uow.run((repos) => this.createWithOwner(repos, { name, userId })); }
  listForUser(userId) { return this.repos.memberships.listTenantsForUser(userId); }

  async lookupBySlug(slug) {
    const tenant = await this.repos.tenants.findBySlug(slug);
    if (!tenant) throw new NotFoundError('We couldn’t find that organisation');
    return { name: tenant.name, slug: tenant.slug };
  }

  async get(tenantId) {
    const tenant = await this.repos.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError('Organisation not found');
    return tenant;
  }

  async completeOnboarding(tenantId, data) {
    await this.repos.tenants.update(tenantId, data);
    await this.repos.tenants.markOnboarded(tenantId);
    return this.get(tenantId);
  }

  /** Owner's UI customization: merges the validated patch into the stored settings (unknown keys can't get in — the schema is strict). */
  async updateUiSettings(tenantId, patch) {
    const current = await this.get(tenantId);
    return this.repos.tenants.update(tenantId, { uiSettings: { ...(current.uiSettings ?? {}), ...patch } });
  }

  async updateTheme(tenantId, theme) {
    await this.repos.tenants.update(tenantId, { theme });
    return this.get(tenantId);
  }

  async listMembers(tenantId, { limit, after }) {
    const page = await paginate(
      (n) => this.repos.memberships.listMembers(tenantId, { limit: n, after: decodeCursor(after) }),
      limit,
      (last) => encodeCursor({ createdAt: last.cursorTs, userId: last.userId }),
    );
    return { ...page, items: page.items.map(({ cursorTs, ...member }) => member) };
  }

  async changeRole({ actor, tenantId, targetUserId, role }) {
    const target = await this.#requireMember(tenantId, targetUserId);
    assertCanManageMember({ actorRole: actor.role, targetRole: target.role, newRole: role });
    if (target.role === 'owner' && role !== 'owner') await this.#assertNotLastOwner(tenantId);
    const updated = await this.repos.memberships.updateRole(tenantId, targetUserId, role);
    await this.membershipLookup.invalidate(tenantId);
    return updated;
  }

  /** Assigns a profile (profiles.id) or clears it with null; takes effect immediately on every worker. */
  async setProfile({ actor, tenantId, targetUserId, profileId }) {
    const target = await this.#requireMember(tenantId, targetUserId);
    assertCanManageMember({ actorRole: actor.role, targetRole: target.role, newRole: target.role });
    const updated = await this.repos.memberships.setProfile(tenantId, targetUserId, profileId);
    await this.membershipLookup.invalidate(tenantId);
    return updated;
  }

  async removeMember({ actor, tenantId, targetUserId }) {
    const target = await this.#requireMember(tenantId, targetUserId);
    assertCanManageMember({ actorRole: actor.role, targetRole: target.role });
    if (target.role === 'owner') await this.#assertNotLastOwner(tenantId);
    await this.repos.memberships.remove(tenantId, targetUserId);
    await this.membershipLookup.invalidate(tenantId);
  }

  async leave({ userId, tenantId }) {
    const membership = await this.#requireMember(tenantId, userId);
    if (membership.role === 'owner') await this.#assertNotLastOwner(tenantId);
    await this.repos.memberships.remove(tenantId, userId);
    await this.membershipLookup.invalidate(tenantId);
  }

  async #requireMember(tenantId, userId) {
    const membership = await this.repos.memberships.find(tenantId, userId);
    if (!membership) throw new NotFoundError('Member not found');
    return membership;
  }

  async #assertNotLastOwner(tenantId) {
    if ((await this.repos.memberships.countOwners(tenantId)) <= 1) throw new ConflictError('An organisation needs at least one owner');
  }

  async #uniqueSlug(repos, name) {
    const base = slugify(name) || 'tenant';
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = attempt === 0 && base.length >= 3 && !isReservedSlug(base) ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`.slice(0, 40);
      if (!(await repos.tenants.slugExists(candidate))) return candidate;
    }
    throw new ConflictError('Could not allocate an organisation URL, please retry');
  }
}
