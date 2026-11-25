import { AUDIT_EVENTS } from '@app/shared';
import { randomToken, safeEqual, sha256 } from '../../shared/security/crypto.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../shared/errors.js';
import { assertCanManageMember } from '../tenants/permissions.js';

const DAY_MS = 86_400_000;

/** Owns the session lifecycle: issue, rotate (with reuse detection), switch tenant, revoke. */
export class SessionService {
  constructor({ securityPolicy, repos, tokens, audit, refreshTtlDays, accessTtlSeconds }) {
    Object.assign(this, { securityPolicy, repos, tokens, audit, refreshTtlMs: refreshTtlDays * DAY_MS, accessTtlSeconds });
  }

  async start({ user, tenantId, ctx, persistent = true }) {
    const activeTenantId = tenantId ?? (await this.defaultTenantId(user));
    const secret = randomToken();
    const session = await this.repos.sessions.create({
      userId: user.id, tenantId: activeTenantId ?? null, refreshHash: sha256(secret), persistent,
      ip: ctx.ip, userAgent: ctx.userAgent, expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    if (activeTenantId) await this.repos.users.update(user.id, { lastTenantId: activeTenantId });
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
    await this.#enforceSessionPolicy(session, ctx);

    const nextSecret = randomToken();
    const rotated = await this.repos.sessions.rotate(session.id, {
      expectedHash: presented, newHash: sha256(nextSecret), expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    if (!rotated) throw new UnauthorizedError('Session expired'); // lost a concurrent-rotation race
    return this.#tokensFor(rotated, nextSecret);
  }

  /** Session Settings + Network Access of the session's tenant: idle timeout, IP lock, allow-list. */
  async #enforceSessionPolicy(session, ctx) {
    if (!session.tenantId) return;
    const policy = await this.securityPolicy.forTenant(session.tenantId);
    const idleMs = Date.now() - session.lastUsedAt.getTime();
    const reason = !session.persistent && policy.sessionTimeoutMs && idleMs > policy.sessionTimeoutMs ? 'idle_timeout' // "remember me" sessions follow the refresh lifetime instead
      : policy.lockIp && session.ip && ctx.ip && session.ip !== ctx.ip ? 'ip_changed'
        : await this.securityPolicy.assertIpAllowed(session.tenantId, ctx.ip).then(() => null, () => 'network_not_allowed');
    if (!reason) return;
    await this.repos.sessions.revoke(session.id, session.userId, reason);
    throw new UnauthorizedError('Session expired');
  }

  /** An admin acts as a member for a short time (Login Access Policies must allow it). Audited and visible to the member; no refresh token. */
  async impersonate({ actor, sessionId, tenantId, targetUserId, ctx }) {
    if (!(await this.securityPolicy.forTenant(tenantId)).loginAsAnyUser) throw new ForbiddenError('Administrators can’t log in as other users in this tenant (Login Access Policies)');
    if (targetUserId === actor.userId) throw new ForbiddenError('You are already signed in as yourself');
    const target = await this.repos.memberships.find(tenantId, targetUserId);
    if (!target) throw new NotFoundError('Member not found');
    assertCanManageMember({ actorRole: actor.role, targetRole: target.role, newRole: target.role });
    await this.audit.record(AUDIT_EVENTS.IMPERSONATION, { userId: targetUserId, tenantId, ctx, metadata: { by: actor.userId } });
    return { accessToken: await this.tokens.signAccess({ userId: targetUserId, sessionId, tenantId, role: target.role, actorId: actor.userId, ttlSeconds: 1800 }), expiresIn: 1800 };
  }

  /** Moves the session to another tenant the user belongs to and mints a fresh access token. */
  async switchTenant({ sessionId, userId, tenantId }) {
    const membership = await this.repos.memberships.find(tenantId, userId);
    if (!membership) throw new ForbiddenError('You are not a member of this tenant');
    await this.repos.sessions.setTenant(sessionId, tenantId);
    await this.repos.users.update(userId, { lastTenantId: tenantId });
    return { accessToken: await this.tokens.signAccess({ userId, sessionId, tenantId, role: membership.role }), expiresIn: this.accessTtlSeconds };
  }

  listActive(userId) { return this.repos.sessions.listActive(userId); }
  revoke(sessionId, userId, reason = 'revoked') { return this.repos.sessions.revoke(sessionId, userId, reason); }
  revokeAll(userId, reason, exceptSessionId) { return this.repos.sessions.revokeAllForUser(userId, reason, exceptSessionId); }

  async defaultTenantId(user) {
    if (user.lastTenantId && (await this.repos.memberships.find(user.lastTenantId, user.id))) return user.lastTenantId;
    const [first] = await this.repos.memberships.listTenantsForUser(user.id);
    return first?.id ?? null;
  }

  async #tokensFor(session, refreshSecret) {
    const membership = session.tenantId ? await this.repos.memberships.find(session.tenantId, session.userId) : null;
    return {
      accessToken: await this.tokens.signAccess({ userId: session.userId, sessionId: session.id, tenantId: membership ? session.tenantId : null, role: membership?.role }),
      expiresIn: this.accessTtlSeconds,
      refreshToken: `${session.id}.${refreshSecret}`,
      refreshExpiresAt: session.expiresAt,
      persistent: session.persistent,
    };
  }
}
