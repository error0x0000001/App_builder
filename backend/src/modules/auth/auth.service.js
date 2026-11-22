import { AUDIT_EVENTS, OTP_LENGTH } from '@app/shared';
import { ForbiddenError, UnauthorizedError, invalidCode, invalidCredentials } from '../../shared/errors.js';
import { ERROR_CODES } from '@app/shared';
import { appLink } from '../../shared/links.js';

const MINUTE_MS = 60_000;

export class AuthService {
  constructor(deps) {
    Object.assign(this, deps); // repos, uow, hasher, tokens, sessions, oneTime, mail, audit, mfa, workspaces, policy
  }

  /** Always resolves the same way whether or not the email is already registered (no account enumeration). */
  async signup(input, ctx) {
    const passwordHash = await this.hasher.hash(input.password); // hash first so timing doesn't reveal existence
    const existing = await this.repos.users.findByEmail(input.email);

    if (existing?.emailVerifiedAt) {
      await this.mail.send('account_exists', existing.email, { loginUrl: appLink('/login'), resetUrl: appLink('/forgot-password') });
      return { email: input.email };
    }

    const profile = { firstName: input.firstName, lastName: input.lastName, jobTitle: input.jobTitle, phone: input.phone, country: input.country };
    let user;
    try {
      user = existing
        ? await this.repos.users.update(existing.id, { ...profile, passwordHash, passwordChangedAt: new Date() }) // restarts an unverified signup
        : await this.uow.run(async (repos) => {
          const created = await repos.users.create({ email: input.email, passwordHash, passwordChangedAt: new Date(), ...profile });
          await this.workspaces.createWithOwner(repos, { name: input.company, userId: created.id, teamSize: input.teamSize });
          return created;
        });
    } catch (error) {
      if (error.code === '23505' || error.cause?.code === '23505') return { email: input.email }; // concurrent signup for the same email
      throw error;
    }
    await this.audit.record(AUDIT_EVENTS.SIGNUP, { userId: user.id, ctx });
    await this.#sendVerificationCode(user);
    return { email: input.email };
  }

  async verifyEmail({ email, code }, ctx) {
    const user = await this.repos.users.findByEmail(email);
    if (!user) await this.hasher.verifyDummy(code); // equalise timing with the real path
    if (!user) throw invalidCode();
    await this.oneTime.verifyCode(user.id, 'email_verification', code);
    const verified = await this.repos.users.update(user.id, { emailVerifiedAt: user.emailVerifiedAt ?? new Date() });
    await this.audit.record(AUDIT_EVENTS.EMAIL_VERIFIED, { userId: user.id, ctx });
    return this.#completeLogin(verified, undefined, ctx);
  }

  async resendVerification({ email }) {
    const user = await this.repos.users.findByEmail(email);
    if (user && !user.emailVerifiedAt && user.status === 'active') await this.#sendVerificationCode(user);
  }

  /** @returns { session } on success or { mfaRequired, mfaToken } when a second factor is needed. */
  async login({ email, password, workspace, rememberMe = true }, ctx) {
    const user = await this.repos.users.findByEmail(email);
    if (!user?.passwordHash) {
      await this.hasher.verifyDummy(password);
      await this.audit.record(AUDIT_EVENTS.LOGIN_FAILED, { ctx, metadata: { reason: 'unknown_account' } });
      throw invalidCredentials();
    }

    const passwordOk = await this.hasher.verify(user.passwordHash, password);
    const locked = user.lockedUntil && user.lockedUntil > new Date();
    if (!passwordOk || locked) {
      if (!passwordOk) await this.#registerFailure(user, ctx, AUDIT_EVENTS.LOGIN_FAILED);
      throw invalidCredentials(); // identical response for wrong password and locked account
    }
    if (user.status !== 'active') throw new ForbiddenError('This account has been disabled', ERROR_CODES.ACCOUNT_DISABLED);
    if (!user.emailVerifiedAt) {
      await this.#sendVerificationCode(user);
      throw new ForbiddenError('Verify your email to continue', ERROR_CODES.EMAIL_NOT_VERIFIED, { email: user.email });
    }
    if (this.hasher.needsRehash(user.passwordHash)) await this.repos.users.update(user.id, { passwordHash: await this.hasher.hash(password) });

    const workspaceId = await this.#resolveWorkspace(user, workspace);
    if (user.mfaEnabled) return { mfaRequired: true, mfaToken: await this.tokens.signMfa({ userId: user.id, workspaceId, persistent: rememberMe }) };
    return { session: await this.#completeLogin(user, workspaceId, ctx, rememberMe) };
  }

  async completeMfaLogin({ mfaToken, code, recoveryCode }, ctx) {
    const { userId, workspaceId, persistent } = await this.tokens.verifyMfa(mfaToken);
    const user = await this.repos.users.findById(userId);
    if (!user?.mfaEnabled || user.status !== 'active' || (user.lockedUntil && user.lockedUntil > new Date())) throw new UnauthorizedError('Sign in again');
    try {
      await this.mfa.verifyChallenge(user, { code, recoveryCode }, ctx);
    } catch (error) {
      await this.#registerFailure(user, ctx, AUDIT_EVENTS.MFA_FAILED);
      throw error;
    }
    return this.#completeLogin(user, workspaceId ?? undefined, ctx, persistent);
  }

  async logout({ sessionId, userId }, ctx) {
    await this.sessions.revoke(sessionId, userId, 'logout');
    await this.audit.record(AUDIT_EVENTS.LOGOUT, { userId, ctx });
  }

  async logoutAll(userId, ctx) {
    await this.sessions.revokeAll(userId, 'logout_all');
    await this.audit.record(AUDIT_EVENTS.LOGOUT_ALL, { userId, ctx });
  }

  /** Used by SSO flows once an identity has been verified externally. */
  completeExternalLogin(user, ctx, workspaceId) { return this.#completeLogin(user, workspaceId, ctx); }

  async #completeLogin(user, workspaceId, ctx, persistent = true) {
    await this.repos.users.recordSuccessfulLogin(user.id);
    const session = await this.sessions.start({ user, workspaceId, ctx, persistent });
    await this.audit.record(AUDIT_EVENTS.LOGIN_SUCCESS, { userId: user.id, workspaceId, ctx });
    return session;
  }

  async #registerFailure(user, ctx, eventType) {
    const state = await this.repos.users.recordFailedLogin(user.id, this.policy);
    await this.audit.record(eventType, { userId: user.id, ctx });
    if (state?.lockedUntil && state.failedLoginCount === this.policy.maxAttempts) {
      await this.audit.record(AUDIT_EVENTS.ACCOUNT_LOCKED, { userId: user.id, ctx });
      await this.mail.send('account_locked', user.email, { minutes: Math.round(this.policy.lockMs / MINUTE_MS) });
    }
  }

  async #resolveWorkspace(user, slug) {
    if (!slug) return undefined;
    const workspace = await this.repos.workspaces.findBySlug(slug);
    if (!workspace || !(await this.repos.memberships.find(workspace.id, user.id))) throw new ForbiddenError('You are not a member of this workspace');
    return workspace.id;
  }

  async #sendVerificationCode(user) {
    const code = await this.oneTime.issueCode(user.id, 'email_verification', { ttlMs: this.policy.verificationTtlMs, digits: OTP_LENGTH });
    await this.mail.send('verify_email', user.email, { code, ttlMinutes: Math.round(this.policy.verificationTtlMs / MINUTE_MS) });
  }
}
