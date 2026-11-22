import { PASSWORD_MIN } from '@app/shared';
import { getSetupPage } from '@app/shared/setup-registry';
import { ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ipInRange } from './ip.js';

const HOUR_MS = 3_600_000;
const COMPLEXITY = { 'No restriction': 0, 'Must mix alpha and numeric characters': 1, 'Must mix alpha, numeric and special characters': 2 };
const COMPLEXITY_RULES = [
  null,
  { test: (v) => /[A-Za-z]/.test(v) && /\d/.test(v), message: 'Use both letters and numbers' },
  { test: (v) => /[A-Za-z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v), message: 'Use letters, numbers and a special character' },
];
const num = (s, fallback) => (Number.isFinite(Number(s)) && s !== '' && s != null ? Number(s) : fallback);
const durationMs = (s) => {
  const m = /^(\d+)\s*(minute|hour|day)s?$/i.exec(s ?? '');
  return m ? Number(m[1]) * { minute: 60_000, hour: HOUR_MS, day: 24 * HOUR_MS }[m[2].toLowerCase()] : null;
};

/**
 * Turns the saved Setup pages (Password Policies, Session Settings, Network Access) into rules the auth code enforces.
 * A user can belong to several workspaces; the strictest rule across them applies to anything not tied to one workspace.
 */
export class SecurityPolicyService {
  constructor({ repos, settings, cache, defaults }) { Object.assign(this, { repos, settings, cache, defaults }); }

  async #values(ws, pageKey) { return (await this.settings.get(ws, getSetupPage(pageKey))).value.values; }

  async forWorkspace(ws) {
    const [pw, sess, access] = await Promise.all([this.#values(ws, 'password-policies'), this.#values(ws, 'session-settings'), this.#values(ws, 'login-access-policies')]);
    const attempts = pw.maximum_invalid_login_attempts;
    return {
      minLength: Math.max(num(pw.minimum_password_length, PASSWORD_MIN), PASSWORD_MIN), // the platform floor always applies, whatever the page says
      complexity: COMPLEXITY[pw.password_complexity_requirement] ?? 0,
      historyCount: num(/^(\d+)/.exec(pw.enforce_password_history ?? '')?.[1], 0),
      expireMs: durationMs(pw.user_passwords_expire_in),
      maxAttempts: attempts === 'No limit' ? Infinity : num(attempts, this.defaults.maxAttempts),
      lockMs: pw.lockout_effective_period === 'Always' ? 10 * 365 * 24 * HOUR_MS : durationMs(pw.lockout_effective_period) ?? this.defaults.lockMs,
      minLifetime: pw.require_a_minimum_1_day_password_lifetime === true,
      sessionTimeoutMs: durationMs(sess.timeout_value),
      lockIp: sess.lock_sessions_to_the_ip_address_from_which_they_originated === true,
      clickjack: sess.enable_clickjack_protection_for_setup_pages === true,
      requireHttps: sess.require_secure_connections_https === true,
      loginAsAnyUser: access.administrators_can_log_in_as_any_user === true,
    };
  }

  /** Strictest combination over every workspace the user belongs to (or the built-in defaults when they have none). */
  async forUser(userId) {
    const workspaces = await this.repos.memberships.listWorkspacesForUser(userId);
    if (!workspaces.length) return { minLength: PASSWORD_MIN, complexity: 0, historyCount: 0, expireMs: null, minLifetime: false, sessionTimeoutMs: null, lockIp: false, maxAttempts: this.defaults.maxAttempts, lockMs: this.defaults.lockMs };
    const all = await Promise.all(workspaces.map((w) => this.forWorkspace(w.id)));
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
    for (const hash of hashes) if (await hasher.verify(hash, password)) throw new ValidationError([{ field: 'password', message: `You can't reuse your last ${policy.historyCount} passwords` }], 'Choose a password you have not used recently');
  }

  /** Trusted IP ranges of a workspace. Empty list = no restriction. */
  ranges(ws) {
    return this.cache.rememberValue(`r:${ws}:network-access`, 'ranges', { ttlMs: 30_000 }, async () =>
      (await this.repos.setupRecords.listAll(ws, 'network-access')).map((r) => ({ start: r.data.start_ip_address, end: r.data.end_ip_address || r.data.start_ip_address })));
  }

  async assertIpAllowed(ws, ip) {
    if (!ws) return;
    const ranges = await this.ranges(ws);
    if (ranges.length && !ranges.some((r) => ipInRange(ip, r.start, r.end))) throw new ForbiddenError('Sign-in from this network is not allowed for this workspace', 'IP_RESTRICTED');
  }
}
