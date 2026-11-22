import { settingsDefaults } from '@app/shared';
import { getSetupPage } from '@app/shared/setup-registry';

/**
 * Health Check = real settings compared with a recommended baseline.
 * `atLeast`/`atMost` compare positions in the page's own option list, so wording stays defined in one place (the registry).
 */
const BASELINE = [
  { page: 'password-policies', key: 'minimum_password_length', rule: 'atLeast', standard: '10', weight: 'high' },
  { page: 'password-policies', key: 'password_complexity_requirement', rule: 'eq', standard: 'Must mix alpha, numeric and special characters', weight: 'high' },
  { page: 'password-policies', key: 'user_passwords_expire_in', rule: 'atMost', standard: '90 days', weight: 'medium' },
  { page: 'password-policies', key: 'enforce_password_history', rule: 'atLeast', standard: '3 passwords remembered', weight: 'medium' },
  { page: 'password-policies', key: 'maximum_invalid_login_attempts', rule: 'atMost', standard: '5', weight: 'high' },
  { page: 'session-settings', key: 'timeout_value', rule: 'atMost', standard: '2 hours', weight: 'medium' },
  { page: 'session-settings', key: 'lock_sessions_to_the_ip_address_from_which_they_originated', rule: 'eq', standard: true, weight: 'medium' },
  { page: 'session-settings', key: 'require_secure_connections_https', rule: 'eq', standard: true, weight: 'high' },
  { page: 'session-settings', key: 'require_httponly_attribute', rule: 'eq', standard: true, weight: 'medium' },
  { page: 'session-settings', key: 'enable_clickjack_protection_for_setup_pages', rule: 'eq', standard: true, weight: 'medium' },
];
const WEIGHT = { high: 3, medium: 2 };

const optionsOf = (page, key) => page.sections.flatMap((s) => s.fields ?? []).find((f) => f.key === key);
const meets = ({ rule, standard }, current, field) => {
  if (rule === 'eq') return current === standard;
  const at = (v) => field.options.indexOf(v);
  return rule === 'atLeast' ? at(current) >= at(standard) : at(current) <= at(standard);
};

export class HealthService {
  constructor({ settings }) { this.settings = settings; }

  async evaluate(ws) {
    const pages = [...new Set(BASELINE.map((b) => b.page))];
    const loaded = Object.fromEntries(await Promise.all(pages.map(async (p) => [p, (await this.settings.get(ws, getSetupPage(p))).value.values])));
    const checks = BASELINE.map((b) => {
      const page = getSetupPage(b.page); const field = optionsOf(page, b.key);
      const current = loaded[b.page][b.key] ?? settingsDefaults(page)[b.key];
      return { ...b, label: field.label, pageName: page.name, current, ok: meets(b, current, field) };
    });
    const total = checks.reduce((n, c) => n + WEIGHT[c.weight], 0);
    const earned = checks.reduce((n, c) => n + (c.ok ? WEIGHT[c.weight] : 0), 0);
    return { score: Math.round((earned / total) * 100), checks, risks: checks.filter((c) => !c.ok) };
  }

  /** "Fix risks": applies the baseline value to every failing setting through the normal settings path (versioned + audited). */
  async fix(ctx) {
    const { risks } = await this.evaluate(ctx.workspaceId);
    const byPage = Map.groupBy(risks, (r) => r.page);
    for (const [pageKey, items] of byPage) {
      const page = getSetupPage(pageKey);
      const current = await this.settings.get(ctx.workspaceId, page);
      await this.settings.update(ctx.workspaceId, page, Object.fromEntries(items.map((r) => [r.key, r.standard])), { userId: ctx.userId, expectedVersion: current.value.version });
    }
    return { fixed: risks.length, ...(await this.evaluate(ctx.workspaceId)) };
  }
}
