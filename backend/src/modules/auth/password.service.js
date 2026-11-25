import { AUDIT_EVENTS } from '@app/shared';
import { appLink } from '../../shared/links.js';
import { ValidationError, invalidCredentials } from '../../shared/errors.js';

const MINUTE_MS = 60_000;

export class PasswordService {
  constructor({ repos, hasher, oneTime, sessions, mail, audit, securityPolicy, resetTtlMs }) {
    Object.assign(this, { repos, hasher, oneTime, sessions, mail, audit, securityPolicy, resetTtlMs });
  }

  /** Same outcome whether or not the account exists. */
  async forgot({ email }, ctx) {
    const user = await this.repos.users.findByEmail(email);
    if (!user || user.status !== 'active') return;
    await this.sendResetLink(user);
    await this.audit.record(AUDIT_EVENTS.PASSWORD_RESET_REQUESTED, { userId: user.id, ctx });
  }

  /** Emails a single-use reset link (also used when a password has expired). */
  async sendResetLink(user) {
    const token = await this.oneTime.issueLink(user.id, 'password_reset', { ttlMs: this.resetTtlMs });
    await this.mail.send('password_reset', user.email, { url: appLink('/reset-password', { token }), ttlMinutes: Math.round(this.resetTtlMs / MINUTE_MS) });
  }

  async reset({ token, password }, ctx) {
    const userId = await this.oneTime.verifyLink('password_reset', token);
    const user = await this.repos.users.findById(userId);
    const policy = await this.#enforcePolicy(user, password);
    // Receiving the emailed link proves mailbox ownership, so it also verifies the address.
    await this.#setPassword(user, password, policy, { emailVerifiedAt: user.emailVerifiedAt ?? new Date(), failedLoginCount: 0, lockedUntil: null });
    await this.sessions.revokeAll(userId, 'password_reset');
    await this.audit.record(AUDIT_EVENTS.PASSWORD_RESET, { userId, ctx });
  }

  async change({ user, sessionId }, { currentPassword, password }, ctx) {
    if (user.passwordHash && !(await this.hasher.verify(user.passwordHash, currentPassword))) throw invalidCredentials();
    const policy = await this.#enforcePolicy(user, password);
    if (policy.minLifetime && user.passwordChangedAt && Date.now() - user.passwordChangedAt.getTime() < 24 * 3_600_000) {
      throw new ValidationError(undefined, 'Your password was changed less than a day ago. Try again tomorrow.');
    }
    await this.#setPassword(user, password, policy);
    await this.sessions.revokeAll(user.id, 'password_changed', sessionId);
    await this.audit.record(AUDIT_EVENTS.PASSWORD_CHANGED, { userId: user.id, ctx });
  }

  /** Tenant password policy (length, complexity, history) on top of the built-in rules. Returns the policy applied. */
  async #enforcePolicy(user, password) {
    const policy = await this.securityPolicy.forUser(user.id);
    this.securityPolicy.assertPasswordAllowed(password, policy);
    await this.securityPolicy.assertNotReused(user.id, password, policy, this.hasher, user.passwordHash);
    return policy;
  }

  async #setPassword(user, password, policy, extra = {}) {
    await this.repos.passwordHistory.remember(user.id, user.passwordHash, policy.historyCount);
    await this.repos.users.update(user.id, { passwordHash: await this.hasher.hash(password), passwordChangedAt: new Date(), ...extra });
    await this.mail.send('password_changed', user.email);
  }
}
