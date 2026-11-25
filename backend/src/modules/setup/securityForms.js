/**
 * The three security pages are stored as typed columns (password_policies, session_policies, login_policies). The pages speak in option
 * labels ("90 days", "Never expires"); this file is the only place that converts between those labels and the columns.
 * Only settings the platform actually enforces have a column; the rest of a page is shown read-only.
 */
const COMPLEXITY = ['No restriction', 'Must mix alpha and numeric characters', 'Must mix alpha, numeric and special characters'];
const days = (n) => `${n} days`;
const minutesLabel = (m) => (m === 60 ? '1 hour' : m % 60 === 0 ? `${m / 60} hours` : `${m} minutes`);
const toMinutes = (label) => { const m = /^(\d+)\s*(minute|hour)s?$/i.exec(label ?? ''); return m ? Number(m[1]) * (m[2].toLowerCase() === 'hour' ? 60 : 1) : null; };
const leadingNumber = (label) => Number(/^(\d+)/.exec(label ?? '')?.[1] ?? 0);

export const SECURITY_FORMS = Object.freeze({
  'password-policies': {
    kind: 'password',
    read: (r) => ({
      user_passwords_expire_in: r.expiry_days ? days(r.expiry_days) : 'Never expires',
      enforce_password_history: r.history_count ? `${r.history_count} passwords remembered` : 'None',
      minimum_password_length: String(r.min_length),
      password_complexity_requirement: COMPLEXITY[r.complexity] ?? COMPLEXITY[0],
      maximum_invalid_login_attempts: r.max_invalid_attempts == null ? 'No limit' : String(r.max_invalid_attempts),
      lockout_effective_period: r.lockout_minutes === 0 ? 'Always' : `${r.lockout_minutes} minutes`,
      require_a_minimum_1_day_password_lifetime: r.minimum_lifetime_one_day,
    }),
    columns: {
      user_passwords_expire_in: (v) => ({ expiry_days: v === 'Never expires' ? null : leadingNumber(v) }),
      enforce_password_history: (v) => ({ history_count: v === 'None' ? 0 : leadingNumber(v) }),
      minimum_password_length: (v) => ({ min_length: Number(v) }),
      password_complexity_requirement: (v) => ({ complexity: Math.max(COMPLEXITY.indexOf(v), 0) }),
      maximum_invalid_login_attempts: (v) => ({ max_invalid_attempts: v === 'No limit' ? null : Number(v) }),
      lockout_effective_period: (v) => ({ lockout_minutes: v === 'Always' ? 0 : leadingNumber(v) }),
      require_a_minimum_1_day_password_lifetime: (v) => ({ minimum_lifetime_one_day: Boolean(v) }),
    },
  },
  'session-settings': {
    kind: 'session',
    read: (r) => ({
      timeout_value: minutesLabel(r.timeout_minutes),
      lock_sessions_to_the_ip_address_from_which_they_originated: r.lock_to_ip,
      require_secure_connections_https: r.require_https,
      enable_clickjack_protection_for_setup_pages: r.clickjack_protection,
    }),
    columns: {
      timeout_value: (v) => ({ timeout_minutes: toMinutes(v) ?? 120 }),
      lock_sessions_to_the_ip_address_from_which_they_originated: (v) => ({ lock_to_ip: Boolean(v) }),
      require_secure_connections_https: (v) => ({ require_https: Boolean(v) }),
      enable_clickjack_protection_for_setup_pages: (v) => ({ clickjack_protection: Boolean(v) }),
    },
  },
  'login-access-policies': {
    kind: 'login',
    read: (r) => ({ administrators_can_log_in_as_any_user: r.admins_can_login_as_any_user }),
    columns: { administrators_can_log_in_as_any_user: (v) => ({ admins_can_login_as_any_user: Boolean(v) }) },
  },
});
