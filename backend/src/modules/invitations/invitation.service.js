import { AUDIT_EVENTS } from '@app/shared';
import { v7 as uuidv7 } from 'uuid';
import { randomToken, safeEqual, sha256 } from '../../shared/security/crypto.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError, invalidToken } from '../../shared/errors.js';
import { ERROR_CODES } from '@app/shared';
import { appLink } from '../../shared/links.js';
import { assertCanManageMember } from '../tenants/permissions.js';

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class InvitationService {
  constructor({ repos, uow, workspaces, hasher, sessions, mail, audit, securityPolicy, ttlDays }) {
    Object.assign(this, { repos, uow, workspaces, hasher, sessions, mail, audit, securityPolicy, ttlDays });
  }

  async invite({ actor, tenantId, email, role }) {
    assertCanManageMember({ actorRole: actor.role, targetRole: 'viewer', newRole: role });
    const existingUser = await this.repos.users.findByEmail(email);
    if (existingUser && (await this.repos.memberships.find(tenantId, existingUser.id))) throw new ConflictError('This person is already a member');

    const pending = await this.repos.invitations.findPending(tenantId, email);
    const { id, token, tokenHash } = this.#newToken(pending?.id);
    const expiresAt = new Date(Date.now() + this.ttlDays * DAY_MS);
    const invitation = pending
      ? await this.repos.invitations.reissue(pending.id, { tokenHash, expiresAt })
      : await this.repos.invitations.create({ id, tenantId, email, role, tokenHash, expiresAt, invitedBy: actor.userId });
    await this.#sendEmail({ invitation, token, inviterId: actor.userId });
    return { id: invitation.id, email, role: invitation.role, expiresAt: invitation.expiresAt };
  }

  /** Bulk invite: one failure (already a member, etc.) doesn't abort the rest. */
  async inviteMany({ actor, tenantId, invitations }) {
    const results = [];
    for (const { email, role } of invitations) {
      try {
        await this.invite({ actor, tenantId, email, role });
        results.push({ email, status: 'sent' });
      } catch (error) {
        results.push({ email, status: 'failed', reason: error.message });
      }
    }
    return results;
  }

  list(tenantId) { return this.repos.invitations.listPending(tenantId); }

  async revoke(tenantId, invitationId) {
    if (!(await this.repos.invitations.revoke(invitationId, tenantId))) throw new NotFoundError('Invitation not found');
  }

  async resend({ actor, tenantId, invitationId }) {
    const invitation = await this.repos.invitations.findById(invitationId);
    if (!invitation || invitation.tenantId !== tenantId || invitation.acceptedAt || invitation.revokedAt) throw new NotFoundError('Invitation not found');
    return this.invite({ actor, tenantId, email: invitation.email, role: invitation.role });
  }

  async preview(presentedToken) {
    const invitation = await this.#redeemable(presentedToken);
    const [inviterName, existingUser] = await Promise.all([this.repos.invitations.inviterName(invitation.invitedBy), this.repos.users.findByEmail(invitation.email)]);
    return { email: invitation.email, role: invitation.role, tenantName: invitation.tenantName, inviterName, userExists: Boolean(existingUser) };
  }

  /**
   * New people create their account here (the emailed link proves they own the address).
   * Existing accounts must already be signed in as the invited user.
   */
  async accept({ token, profile, authUserId }, ctx) {
    const invitation = await this.#redeemable(token);
    const existing = await this.repos.users.findByEmail(invitation.email);

    if (existing && authUserId !== existing.id) throw new UnauthorizedError('Sign in to accept this invitation', ERROR_CODES.LOGIN_REQUIRED);
    if (!existing && !(profile.firstName && profile.lastName && profile.password && profile.acceptTerms)) {
      throw new ValidationError(undefined, 'Complete your profile to accept this invitation');
    }
    if (!existing) this.securityPolicy.assertPasswordAllowed(profile.password, await this.securityPolicy.forTenant(invitation.tenantId)); // the organisation's Password Policies apply to people it invites
    const passwordHash = existing ? null : await this.hasher.hash(profile.password);

    const user = await this.uow.run(async (repos) => {
      if (!(await repos.invitations.markAccepted(invitation.id))) throw invalidToken();
      const member = existing ?? (await repos.users.create({
        email: invitation.email, passwordHash, passwordChangedAt: new Date(), emailVerifiedAt: new Date(),
        firstName: profile.firstName, lastName: profile.lastName,
      }));
      await repos.memberships.add({ tenantId: invitation.tenantId, userId: member.id, role: invitation.role });
      await this.workspaces.assignOnJoin(repos, { tenantId: invitation.tenantId, userId: member.id });
      return member;
    });
    await this.audit.record(AUDIT_EVENTS.INVITATION_ACCEPTED, { userId: user.id, tenantId: invitation.tenantId, ctx });

    const session = existing ? null : await this.sessions.start({ user, tenantId: invitation.tenantId, ctx });
    return { tenantId: invitation.tenantId, session };
  }

  async #redeemable(presented) {
    const [id, secret] = presented.split('.');
    if (!id || !secret || !UUID.test(id)) throw invalidToken();
    const invitation = await this.repos.invitations.findById(id);
    const unusable = !invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date();
    if (unusable || !safeEqual(invitation.tokenHash, sha256(secret))) throw invalidToken();
    return invitation;
  }

  #newToken(existingId) {
    const id = existingId ?? uuidv7();
    const secret = randomToken();
    return { id, token: `${id}.${secret}`, tokenHash: sha256(secret) };
  }

  async #sendEmail({ invitation, token, inviterId }) {
    const [tenant, inviterName] = await Promise.all([this.repos.tenants.findById(invitation.tenantId), this.repos.invitations.inviterName(inviterId)]);
    await this.mail.send('invitation', invitation.email, {
      inviterName: inviterName ?? 'A teammate', tenantName: tenant.name, role: invitation.role,
      url: appLink('/accept-invite', { token }), ttlDays: this.ttlDays,
    }, { tenantId: invitation.tenantId, kind: 'system' });
  }
}
