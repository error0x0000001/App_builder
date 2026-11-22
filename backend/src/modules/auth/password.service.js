import { AUDIT_EVENTS } from '@app/shared';
import { appLink } from '../../shared/links.js';
import { invalidCredentials } from '../../shared/errors.js';

const MINUTE_MS = 60_000;

export class PasswordService {
  constructor({ repos, hasher, oneTime, sessions, mail, audit, resetTtlMs }) {
    Object.assign(this, { repos, hasher, oneTime, sessions, mail, audit, resetTtlMs });
  }

  /** Same outcome whether or not the account exists. */
  async forgot({ email }, ctx) {
    const user = await this.repos.users.findByEmail(email);
    if (!user || user.status !== 'active') return;
    const token = await this.oneTime.issueLink(user.id, 'password_reset', { ttlMs: this.resetTtlMs });
    await this.mail.send('password_reset', user.email, { url: appLink('/reset-password', { token }), ttlMinutes: Math.round(this.resetTtlMs / MINUTE_MS) });
    await this.audit.record(AUDIT_EVENTS.PASSWORD_RESET_REQUESTED, { userId: user.id, ctx });
  }

  async reset({ token, password }, ctx) {
    const userId = await this.oneTime.verifyLink('password_reset', token);
    const user = await this.repos.users.findById(userId);
    // Receiving the emailed link proves mailbox ownership, so it also verifies the address.
    await this.#setPassword(user, password, { emailVerifiedAt: user.emailVerifiedAt ?? new Date(), failedLoginCount: 0, lockedUntil: null });
    await this.sessions.revokeAll(userId, 'password_reset');
    await this.audit.record(AUDIT_EVENTS.PASSWORD_RESET, { userId, ctx });
  }

  async change({ user, sessionId }, { currentPassword, password }, ctx) {
    if (user.passwordHash && !(await this.hasher.verify(user.passwordHash, currentPassword))) throw invalidCredentials();
    await this.#setPassword(user, password);
    await this.sessions.revokeAll(user.id, 'password_changed', sessionId);
    await this.audit.record(AUDIT_EVENTS.PASSWORD_CHANGED, { userId: user.id, ctx });
  }

  async #setPassword(user, password, extra = {}) {
    await this.repos.users.update(user.id, { passwordHash: await this.hasher.hash(password), passwordChangedAt: new Date(), ...extra });
    await this.mail.send('password_changed', user.email);
  }
}
