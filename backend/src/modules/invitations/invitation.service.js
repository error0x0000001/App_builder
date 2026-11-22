import { AUDIT_EVENTS } from '@app/shared';
import { v7 as uuidv7 } from 'uuid';
import { randomToken, safeEqual, sha256 } from '../../shared/security/crypto.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError, invalidToken } from '../../shared/errors.js';
import { ERROR_CODES } from '@app/shared';
import { appLink } from '../../shared/links.js';
import { assertCanManageMember } from '../workspaces/permissions.js';

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class InvitationService {
  constructor({ repos, uow, hasher, sessions, mail, audit, ttlDays }) {
    Object.assign(this, { repos, uow, hasher, sessions, mail, audit, ttlDays });
  }

  async invite({ actor, workspaceId, email, role }) {
    assertCanManageMember({ actorRole: actor.role, targetRole: 'viewer', newRole: role });
    const existingUser = await this.repos.users.findByEmail(email);
    if (existingUser && (await this.repos.memberships.find(workspaceId, existingUser.id))) throw new ConflictError('This person is already a member');

    const pending = await this.repos.invitations.findPending(workspaceId, email);
    const { id, token, tokenHash } = this.#newToken(pending?.id);
    const expiresAt = new Date(Date.now() + this.ttlDays * DAY_MS);
    const invitation = pending
      ? await this.repos.invitations.reissue(pending.id, { tokenHash, expiresAt })
      : await this.repos.invitations.create({ id, workspaceId, email, role, tokenHash, expiresAt, invitedBy: actor.userId });
    await this.#sendEmail({ invitation, token, inviterId: actor.userId });
    return { id: invitation.id, email, role: invitation.role, expiresAt: invitation.expiresAt };
  }

  /** Bulk invite: one failure (already a member, etc.) doesn't abort the rest. */
  async inviteMany({ actor, workspaceId, invitations }) {
    const results = [];
    for (const { email, role } of invitations) {
      try {
        await this.invite({ actor, workspaceId, email, role });
        results.push({ email, status: 'sent' });
      } catch (error) {
        results.push({ email, status: 'failed', reason: error.message });
      }
    }
    return results;
  }

  list(workspaceId) { return this.repos.invitations.listPending(workspaceId); }

  async revoke(workspaceId, invitationId) {
    if (!(await this.repos.invitations.revoke(invitationId, workspaceId))) throw new NotFoundError('Invitation not found');
  }

  async resend({ actor, workspaceId, invitationId }) {
    const invitation = await this.repos.invitations.findById(invitationId);
    if (!invitation || invitation.workspaceId !== workspaceId || invitation.acceptedAt || invitation.revokedAt) throw new NotFoundError('Invitation not found');
    return this.invite({ actor, workspaceId, email: invitation.email, role: invitation.role });
  }

  async preview(presentedToken) {
    const invitation = await this.#redeemable(presentedToken);
    const [inviterName, existingUser] = await Promise.all([this.repos.invitations.inviterName(invitation.invitedBy), this.repos.users.findByEmail(invitation.email)]);
    return { email: invitation.email, role: invitation.role, workspaceName: invitation.workspaceName, inviterName, userExists: Boolean(existingUser) };
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
    const passwordHash = existing ? null : await this.hasher.hash(profile.password);

    const user = await this.uow.run(async (repos) => {
      if (!(await repos.invitations.markAccepted(invitation.id))) throw invalidToken();
      const member = existing ?? (await repos.users.create({
        email: invitation.email, passwordHash, passwordChangedAt: new Date(), emailVerifiedAt: new Date(),
        firstName: profile.firstName, lastName: profile.lastName,
      }));
      await repos.memberships.add({ workspaceId: invitation.workspaceId, userId: member.id, role: invitation.role });
      return member;
    });
    await this.audit.record(AUDIT_EVENTS.INVITATION_ACCEPTED, { userId: user.id, workspaceId: invitation.workspaceId, ctx });

    const session = existing ? null : await this.sessions.start({ user, workspaceId: invitation.workspaceId, ctx });
    return { workspaceId: invitation.workspaceId, session };
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
    const [workspace, inviterName] = await Promise.all([this.repos.workspaces.findById(invitation.workspaceId), this.repos.invitations.inviterName(inviterId)]);
    await this.mail.send('invitation', invitation.email, {
      inviterName: inviterName ?? 'A teammate', workspaceName: workspace.name, role: invitation.role,
      url: appLink('/accept-invite', { token }), ttlDays: this.ttlDays,
    });
  }
}
