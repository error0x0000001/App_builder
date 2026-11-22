import { AUDIT_EVENTS } from '@app/shared';
import { randomToken, safeEqual, sha256 } from '../../shared/security/crypto.js';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors.js';

const DAY_MS = 86_400_000;

/** Owns the session lifecycle: issue, rotate (with reuse detection), switch workspace, revoke. */
export class SessionService {
  constructor({ repos, tokens, audit, refreshTtlDays, accessTtlSeconds }) {
    Object.assign(this, { repos, tokens, audit, refreshTtlMs: refreshTtlDays * DAY_MS, accessTtlSeconds });
  }

  async start({ user, workspaceId, ctx, persistent = true }) {
    const activeWorkspaceId = workspaceId ?? (await this.#defaultWorkspaceId(user));
    const secret = randomToken();
    const session = await this.repos.sessions.create({
      userId: user.id, workspaceId: activeWorkspaceId ?? null, refreshHash: sha256(secret), persistent,
      ip: ctx.ip, userAgent: ctx.userAgent, expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    if (activeWorkspaceId) await this.repos.users.update(user.id, { lastWorkspaceId: activeWorkspaceId });
    return this.#tokensFor(session, secret);
  }

  async refresh(refreshToken, ctx) {
    const [sessionId, secret] = (refreshToken ?? '').split('.');
    if (!sessionId || !secret) throw new UnauthorizedError('Session expired');
    const session = await this.repos.sessions.findById(sessionId).catch(() => null);
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw new UnauthorizedError('Session expired');

    const presented = sha256(secret);
    if (!safeEqual(presented, session.refreshHash)) {
      if (session.prevRefreshHash && safeEqual(presented, session.prevRefreshHash)) {
        await this.repos.sessions.revoke(session.id, session.userId, 'refresh_reuse');
        await this.audit.record(AUDIT_EVENTS.REFRESH_REUSE, { userId: session.userId, ctx });
      }
      throw new UnauthorizedError('Session expired');
    }

    const user = await this.repos.users.findById(session.userId);
    if (!user || user.status !== 'active') throw new UnauthorizedError('Session expired');

    const nextSecret = randomToken();
    const rotated = await this.repos.sessions.rotate(session.id, {
      expectedHash: presented, newHash: sha256(nextSecret), expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    if (!rotated) throw new UnauthorizedError('Session expired'); // lost a concurrent-rotation race
    return this.#tokensFor(rotated, nextSecret);
  }

  /** Moves the session to another workspace the user belongs to and mints a fresh access token. */
  async switchWorkspace({ sessionId, userId, workspaceId }) {
    const membership = await this.repos.memberships.find(workspaceId, userId);
    if (!membership) throw new ForbiddenError('You are not a member of this workspace');
    await this.repos.sessions.setWorkspace(sessionId, workspaceId);
    await this.repos.users.update(userId, { lastWorkspaceId: workspaceId });
    return { accessToken: await this.tokens.signAccess({ userId, sessionId, workspaceId, role: membership.role }), expiresIn: this.accessTtlSeconds };
  }

  listActive(userId) { return this.repos.sessions.listActive(userId); }
  revoke(sessionId, userId, reason = 'revoked') { return this.repos.sessions.revoke(sessionId, userId, reason); }
  revokeAll(userId, reason, exceptSessionId) { return this.repos.sessions.revokeAllForUser(userId, reason, exceptSessionId); }

  async #defaultWorkspaceId(user) {
    if (user.lastWorkspaceId && (await this.repos.memberships.find(user.lastWorkspaceId, user.id))) return user.lastWorkspaceId;
    const [first] = await this.repos.memberships.listWorkspacesForUser(user.id);
    return first?.id ?? null;
  }

  async #tokensFor(session, refreshSecret) {
    const membership = session.workspaceId ? await this.repos.memberships.find(session.workspaceId, session.userId) : null;
    return {
      accessToken: await this.tokens.signAccess({ userId: session.userId, sessionId: session.id, workspaceId: membership ? session.workspaceId : null, role: membership?.role }),
      expiresIn: this.accessTtlSeconds,
      refreshToken: `${session.id}.${refreshSecret}`,
      refreshExpiresAt: session.expiresAt,
      persistent: session.persistent,
    };
  }
}
