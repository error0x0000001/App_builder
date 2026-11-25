import { PASSWORD_MIN } from '@app/shared';
import { ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ipInRange } from './ip.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FOREVER_MS = 10 * 365 * DAY_MS;
const COMPLEXITY_RULES = [
  null,
  { test: (v) => /[A-Za-z]/.test(v) && /\d/.test(v), message: 'Use both letters and numbers' },
  { test: (v) => /[A-Za-z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v), message: 'Use letters, numbers and a special character' },
];
export const policyNamespace = (tenantId) => `policy:${tenantId}`;

/**
 * The rules the auth code enforces, read from the tenant's password / session / login policy rows and trusted networks.
 * A person can belong to several tenants; the strictest rule across them applies to anything not tied to one tenant.
 */
export class SecurityPolicyService {
  constructor({ repos, cache, defaults }) { Object.assign(this, { repos, cache, defaults }); }

  forTenant(tenantId) {
    return this.cache.rememberValue(policyNamespace(tenantId), 'rules', { ttlMs: 30_000 }, async () => {
      const [pw, sess, login] = await Promise.all([this.repos.security.password(tenantId), this.repos.security.session(tenantId), this.repos.security.login(tenantId)]);
      return {
        minLength: Math.max(pw?.min_length ?? PASSWORD_MIN, PASSWORD_MIN), // the platform floor always applies
        complexity: pw?.complexity ?? 0,
        historyCount: pw?.history_count ?? 0,
        expireMs: pw?.expiry_days ? pw.expiry_days * DAY_MS : null,
        maxAttempts: pw ? (pw.max_invalid_attempts ?? Infinity) : this.defaults.maxAttempts,
        lockMs: pw ? (pw.lockout_minutes === 0 ? FOREVER_MS : pw.lockout_minutes * 60_000) : this.defaults.lockMs,
        minLifetime: pw?.minimum_lifetime_one_day === true,
        sessionTimeoutMs: sess ? sess.timeout_minutes * 60_000 : null,
        lockIp: sess?.lock_to_ip === true,
        clickjack: sess?.clickjack_protection === true,
        requireHttps: sess?.require_https === true,
        loginAsAnyUser: login?.admins_can_login_as_any_user === true,
      };
    });
  }

  /** Call after a policy or the trusted networks change. */
  changed(tenantId) { return this.cache.bump(policyNamespace(tenantId)); }

  /** Strictest combination over every tenant the user belongs to (or the built-in defaults when they have none). */
  async forUser(userId) {
    const tenants = await this.repos.memberships.listTenantsForUser(userId);
    if (!tenants.length) return { minLength: PASSWORD_MIN, complexity: 0, historyCount: 0, expireMs: null, minLifetime: false, sessionTimeoutMs: null, lockIp: false, maxAttempts: this.defaults.maxAttempts, lockMs: this.defaults.lockMs };
    const all = await Promise.all(tenants.map((t) => this.forTenant(t.id)));
    return {
      minLength: Math.max(...all.map((p) => p.minLength)),
      complexity: Math.max(...all.map((p) => p.complexity)),
      historyCount: Math.max(...all.map((p) => p.historyCount)),
      expireMs: Math.min(...all.map((p) => p.expireMs ?? Infinity)),
      maxAttempts: Math.min(...all.map((p) => p.maxAttempts)),
      lockMs: Math.max(...all.map((p) => p.lockMs)),
      minLifetime: all.some((p) => p.minLifetime),
      sessionTimeoutMs: Math.min(...all.map((p) => p.sessionTimeoutMs ?? Infinity)),
      lockIp: all.some((p) => p.lockIp),
    };
  }

  /** Messages for every rule the password breaks (empty = acceptable). */
  violations(password, policy) {
    const out = [];
    if (password.length < policy.minLength) out.push(`Use at least ${policy.minLength} characters`);
    const rule = COMPLEXITY_RULES[policy.complexity];
    if (rule && !rule.test(password)) out.push(rule.message);
    return out;
  }

  assertPasswordAllowed(password, policy) {
    const issues = this.violations(password, policy);
    if (issues.length) throw new ValidationError(issues.map((message) => ({ field: 'password', message })), issues[0]);
  }

  /** Rejects reuse of the last N passwords (N from the policy). `hasher.verify` is slow by design, so N is small. */
  async assertNotReused(userId, password, policy, hasher, currentHash) {
    if (!policy.historyCount) return;
    const recent = await this.repos.passwordHistory.recent(userId, policy.historyCount);
    const hashes = [currentHash, ...recent.map((r) => r.passwordHash)].filter(Boolean).slice(0, policy.historyCount);
    for (const hash of hashes) if (await hasher.verify(hash, password)) throw new ValidationError([{ field: 'password', message: `You can't reuse your last ${policy.historyCount} passwords` }], 'Choose a password you haven’t used before');
  }

  /** Trusted IP ranges of a tenant. Empty list = no restriction. */
  ranges(tenantId) {
    return this.cache.rememberValue(policyNamespace(tenantId), 'ranges', { ttlMs: 30_000 }, async () => (await this.repos.security.listRanges(tenantId)).map((r) => ({ start: r.start_ip, end: r.end_ip })));
  }

  async assertIpAllowed(tenantId, ip) {
    if (!tenantId) return;
    const ranges = await this.ranges(tenantId);
    if (ranges.length && !ranges.some((r) => ipInRange(ip, r.start, r.end))) throw new ForbiddenError('Sign-in from this network is not allowed for this organisation', 'IP_RESTRICTED');
  }
}
