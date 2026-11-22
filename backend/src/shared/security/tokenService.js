import { SignJWT, jwtVerify } from 'jose';
import { UnauthorizedError } from '../errors.js';

const ISSUER = 'app-builder';

/** Signs/verifies short-lived stateless JWTs (access tokens and MFA challenge tokens). */
export class TokenService {
  constructor({ secret, accessTtlSeconds }) {
    this.key = new TextEncoder().encode(secret);
    this.accessTtlSeconds = accessTtlSeconds;
  }

  #sign(claims, subject, ttlSeconds) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(subject)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key);
  }

  async #verify(token, type) {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ['HS256'] });
      if (payload.typ !== type) throw new Error('wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }
  }

  signAccess({ userId, sessionId, workspaceId, role }) {
    return this.#sign({ typ: 'access', sid: sessionId, wid: workspaceId ?? null, role: role ?? null }, userId, this.accessTtlSeconds);
  }

  async verifyAccess(token) {
    const p = await this.#verify(token, 'access');
    return { userId: p.sub, sessionId: p.sid, workspaceId: p.wid, role: p.role };
  }

  signMfa({ userId, workspaceId, persistent = true }) {
    return this.#sign({ typ: 'mfa', wid: workspaceId ?? null, rem: persistent }, userId, 300);
  }

  async verifyMfa(token) {
    const p = await this.#verify(token, 'mfa');
    return { userId: p.sub, workspaceId: p.wid, persistent: p.rem !== false };
  }

  /** Short-lived signed state for the OAuth round trip (replaces server-side storage). */
  signState(claims) {
    return this.#sign({ typ: 'oauth_state', ...claims }, 'oauth', 600);
  }

  async verifyState(token) {
    const p = await this.#verify(token, 'oauth_state');
    return p;
  }
}
