import { AUDIT_EVENTS } from '@app/shared';
import { hmac, randomRecoveryCode } from '../../shared/security/crypto.js';
import { ConflictError, ValidationError, invalidCode, invalidCredentials } from '../../shared/errors.js';

const RECOVERY_CODE_COUNT = 10;

export class MfaService {
  constructor({ repos, uow, totp, secretBox, hasher, sessions, audit, mail, pepper }) {
    Object.assign(this, { repos, uow, totp, secretBox, hasher, sessions, audit, mail, pepper });
  }

  async beginSetup(user) {
    if (user.mfaEnabled) throw new ConflictError('Two-factor authentication is already enabled');
    const secret = this.totp.generateSecret();
    await this.repos.users.update(user.id, { mfaSecretEnc: this.secretBox.encrypt(secret) });
    return { secret, otpauthUrl: this.totp.uri(secret, user.email) };
  }

  async enable(user, code, { sessionId, ctx }) {
    if (user.mfaEnabled) throw new ConflictError('Two-factor authentication is already enabled');
    if (!user.mfaSecretEnc) throw new ValidationError(undefined, 'Start setup before enabling');
    await this.#verifyTotp(user, code);
    const recoveryCodes = await this.#replaceRecoveryCodes(user.id, true);
    await this.sessions.revokeAll(user.id, 'mfa_enabled', sessionId);
    await this.audit.record(AUDIT_EVENTS.MFA_ENABLED, { userId: user.id, ctx });
    await this.mail.send('mfa_changed', user.email, { enabled: true });
    return { recoveryCodes };
  }

  async disable(user, { password, code }, ctx) {
    if (!user.mfaEnabled) throw new ConflictError('Two-factor authentication is not enabled');
    if (user.passwordHash && !(await this.hasher.verify(user.passwordHash, password ?? ''))) throw invalidCredentials();
    await this.#verifyTotp(user, code);
    await this.uow.run(async (repos) => {
      await repos.users.update(user.id, { mfaEnabled: false, mfaSecretEnc: null, mfaLastStep: 0 });
      await repos.recoveryCodes.deleteAll(user.id);
    });
    await this.audit.record(AUDIT_EVENTS.MFA_DISABLED, { userId: user.id, ctx });
    await this.mail.send('mfa_changed', user.email, { enabled: false });
  }

  async regenerateRecoveryCodes(user, code) {
    if (!user.mfaEnabled) throw new ConflictError('Two-factor authentication is not enabled');
    await this.#verifyTotp(user, code);
    return { recoveryCodes: await this.#replaceRecoveryCodes(user.id) };
  }

  async recoveryCodesRemaining(userId) { return this.repos.recoveryCodes.countRemaining(userId); }

  /** Verifies a login-time challenge: TOTP code or one-time recovery code. Throws on failure. */
  async verifyChallenge(user, { code, recoveryCode }, ctx) {
    if (recoveryCode) {
      const ok = await this.repos.recoveryCodes.consume(user.id, this.#hashRecovery(user.id, recoveryCode));
      if (!ok) throw invalidCode();
      await this.audit.record(AUDIT_EVENTS.RECOVERY_CODE_USED, { userId: user.id, ctx });
      return;
    }
    await this.#verifyTotp(user, code);
  }

  async #verifyTotp(user, code) {
    const step = this.totp.verify(this.secretBox.decrypt(user.mfaSecretEnc), code);
    if (step === null || !(await this.repos.users.claimMfaStep(user.id, step))) throw invalidCode();
  }

  #hashRecovery(userId, code) { return hmac(this.pepper, `${userId}:recovery:${code}`); }

  async #replaceRecoveryCodes(userId, activate = false) {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, randomRecoveryCode);
    await this.uow.run(async (repos) => {
      await repos.recoveryCodes.replaceAll(userId, codes.map((c) => this.#hashRecovery(userId, c)));
      if (activate) await repos.users.update(userId, { mfaEnabled: true });
    });
    return codes;
  }
}
