import { ADAPTER_META } from './adapters.js';
import { SETUP_TOOLS } from './tools.js';

/**
 * What a Setup page actually does today — ONE classification used by the status report, the API and the in-page banner.
 * `CONSUMED_SETTINGS[pageKey]` lists the settings code really reads and writes (typed columns); every other setting of the page is shown read-only.
 * Keep it in sync with `backend/src/modules/setup/securityForms.js`.
 */
export const CONSUMED_SETTINGS = Object.freeze({
  'password-policies': ['minimum_password_length', 'password_complexity_requirement', 'user_passwords_expire_in', 'enforce_password_history', 'maximum_invalid_login_attempts', 'lockout_effective_period', 'require_a_minimum_1_day_password_lifetime'],
  'session-settings': ['timeout_value', 'lock_sessions_to_the_ip_address_from_which_they_originated', 'require_secure_connections_https', 'enable_clickjack_protection_for_setup_pages'],
  'login-access-policies': ['administrators_can_log_in_as_any_user'],
});

const REAL_SPECIALS = new Set(['sharing', 'health', 'sysoverview', 'themes', 'objmgr', 'schema']);
const REAL_DASHBOARDS = new Set(['storage-usage', 'platform-cache', 'optimizer']);
const NOT_ENABLED = new Set(['readiness-assessor', 'data-com-licenses-and-limits', 'lightning-experience-transition-assistant', 'data-integration-metrics']);
const BINDINGS = new Set(['company-information', 'my-domain']);
const EXTERNAL = /^(appexchange-marketplace|mobile-quick-start|linkedin-lead-gen|iot-get-started|snap-ins|canvas-app-previewer|integrations|identity-connect|regenerate-a-content-or-file-preview)$/;

const PREVIEW = { status: 'Preview', level: 'preview', note: 'Shows sample content. The feature behind this page is not built yet, so nothing can be changed here.' };

/** @returns { status: string, level: 'real'|'partial'|'preview'|'recorded'|'external'|'notEnabled', note: string } */
export function setupStatus(p) {
  const all = p.sections?.flatMap((s) => s.fields ?? []) ?? [];
  if (ADAPTER_META[p.key]) return { status: 'Real platform data', level: 'real', note: 'Reads and writes a real table.' };
  if (BINDINGS.has(p.key)) return { status: 'Real platform data', level: 'real', note: 'Bound to the organisation record.' };
  const consumed = CONSUMED_SETTINGS[p.key];
  if (consumed && all.length) {
    const dead = all.filter((f) => !consumed.includes(f.key)).map((f) => f.label);
    return { status: 'Enforced by the platform', level: dead.length ? 'partial' : 'real', note: `${consumed.length} of ${all.length} settings change behaviour${dead.length ? `; shown read-only: ${dead.join(', ')}` : ''}.` };
  }
  if (p.kind === 'special') return REAL_SPECIALS.has(p.special) ? { status: 'Real data + engine', level: 'real', note: `Dedicated page (${p.special}).` } : PREVIEW;
  if (p.kind === 'dashboard') {
    if (NOT_ENABLED.has(p.key)) return { status: 'Reports "not enabled"', level: 'notEnabled', note: 'The feature behind this dashboard does not exist in Quelli.' };
    return REAL_DASHBOARDS.has(p.key) ? { status: 'Live metrics', level: 'real', note: 'Computed from real data, cached 60 s.' } : PREVIEW;
  }
  if (p.kind === 'info') {
    if (SETUP_TOOLS[p.key]) return { status: 'Working tool', level: 'real', note: `Handler: ${SETUP_TOOLS[p.key].handler}.` };
    return EXTERNAL.test(p.key)
      ? { status: 'External product', level: 'external', note: 'A connector to a product Quelli does not include; the request is audited and nothing else happens.' }
      : { status: 'Recorded only', level: 'recorded', note: 'The request is audited; the tool engine is not built.' };
  }
  return PREVIEW;
}
