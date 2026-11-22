import { hmac, randomDigits, randomToken, safeEqual, sha256 } from '../../shared/security/crypto.js';
import { invalidCode, invalidToken } from '../../shared/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CODE_ATTEMPTS = 5;

/** Issues and redeems single-use secrets: short numeric codes (OTP) and long link tokens. */
export class OneTimeTokenService {
  constructor({ repos, pepper }) { this.repos = repos; this.pepper = pepper; }

  async issueCode(userId, type, { ttlMs, digits }) {
    await this.repos.authTokens.invalidateAll(userId, type);
    const code = randomDigits(digits);
    await this.repos.authTokens.create({ userId, type, tokenHash: hmac(this.pepper, `${userId}:${code}`), expiresAt: new Date(Date.now() + ttlMs) });
    return code;
  }

  async verifyCode(userId, type, code) {
    const token = await this.repos.authTokens.findLatest(userId, type);
    if (!token || token.expiresAt < new Date() || token.attempts >= MAX_CODE_ATTEMPTS) throw invalidCode();
    if (!safeEqual(token.tokenHash, hmac(this.pepper, `${userId}:${code}`))) {
      await this.repos.authTokens.incrementAttempts(token.id);
      throw invalidCode();
    }
    if (!(await this.repos.authTokens.consume(token.id))) throw invalidCode();
  }

  async issueLink(userId, type, { ttlMs }) {
    await this.repos.authTokens.invalidateAll(userId, type);
    const secret = randomToken();
    const token = await this.repos.authTokens.create({ userId, type, tokenHash: sha256(secret), expiresAt: new Date(Date.now() + ttlMs) });
    return `${token.id}.${secret}`;
  }

  /** @returns the userId the token was issued to. */
  async verifyLink(type, presented) {
    const [id, secret] = presented.split('.');
    if (!id || !secret || !UUID.test(id)) throw invalidToken();
    const token = await this.repos.authTokens.findById(id);
    if (!token || token.type !== type || token.consumedAt || token.expiresAt < new Date() || !safeEqual(token.tokenHash, sha256(secret))) throw invalidToken();
    if (!(await this.repos.authTokens.consume(token.id))) throw invalidToken();
    return token.userId;
  }
}
