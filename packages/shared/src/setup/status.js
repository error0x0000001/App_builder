import { RULE_COLLECTIONS } from '../automation.js';
import { ADAPTER_META } from './adapters.js';
import { SETUP_TOOLS } from './tools.js';

/**
 * What a Setup page actually does today — ONE classification used by the status report, the API and the in-page banner.
 * `consumed[pageKey]` lists the settings code really reads; every other setting of the page is stored only.
 * Keep it in sync with the code that reads them (grep the key name).
 */
export const CONSUMED_SETTINGS = Object.freeze({
  'password-policies': ['minimum_password_length', 'password_complexity_requirement', 'user_passwords_expire_in', 'enforce_password_history', 'maximum_invalid_login_attempts', 'lockout_effective_period', 'require_a_minimum_1_day_password_lifetime'],
  'session-settings': ['timeout_value', 'lock_sessions_to_the_ip_address_from_which_they_originated', 'require_secure_connections_https', 'enable_clickjack_protection_for_setup_pages'],
  'login-access-policies': ['administrators_can_log_in_as_any_user'],
  deliverability: ['access_level'],
  'compliance-bcc-email': ['enable_compliance_bcc_email', 'bcc_email_address', 'include_salesforce_emails_sent_as_system'],
  'email-footers': ['append_footer_to_outbound_mass_email', 'footer_text'],
  'opportunity-settings': ['require_close_date_in_the_future', 'enable_big_deal_alerts', 'big_deal_amount'],
  'support-settings': ['notify_case_owner'],
  'activity-settings': ['enable_task_notifications'],
  'web-to-lead': ['web_to_lead_enabled'],
  'web-to-case': ['enable_web_to_case'],
  'email-to-case': ['enable_email_to_case'],
});

const ACCESS_PAGES = {
  profiles: 'Names a permission container; its permissions are the Object Settings rows with the same name; assigned on the Users page.',
  'object-settings': 'The grants: per object, per profile or permission set, Yes/No for read / create / edit / delete (object "All" = every object). Enforced on every object request.',
  'manage-assignments': 'Assigns a permission set to a person (by email). Effective permissions are the union of their profile and assigned sets.',
  'business-hours': 'Defines working days and hours; Escalation Rules count their threshold in business hours (excluding Holidays).',
  holidays: 'Days excluded from Business Hours when Escalation Rules measure elapsed time.',
};
const ENGINE_OUTPUT = { 'duplicate-error-logs': 'Written by Duplicate Rules when they block or flag a record.', 'case-escalations': 'Written by the 15-minute Escalation job.' };
const EXTERNAL = /^(appexchange-marketplace|mobile-quick-start|linkedin-lead-gen|iot-get-started|snap-ins|canvas-app-previewer|integrations|identity-connect|regenerate-a-content-or-file-preview)$/;
const NOT_ENABLED = new Set(['readiness-assessor', 'data-com-licenses-and-limits', 'lightning-experience-transition-assistant']);
const BINDINGS = new Set(['company-information', 'my-domain']);
const INTAKE = new Set(['web-to-lead', 'web-to-case', 'email-to-case']);

/** @returns { status: string, level: 'real'|'partial'|'stored'|'recorded'|'external'|'notEnabled', note: string } */
export function setupStatus(p) {
  const all = p.sections?.flatMap((s) => s.fields ?? []) ?? [];
  const consumed = CONSUMED_SETTINGS[p.key];
  if (ADAPTER_META[p.key]) return { status: 'Real platform data', level: 'real', note: 'Reads / writes the real table (users, sessions, logins, audit, schedules).' };
  if (BINDINGS.has(p.key)) return { status: 'Real platform data', level: 'real', note: 'Bound to the workspace record.' };
  if (RULE_COLLECTIONS[p.key]) return { status: 'Rule engine (runs on records)', level: 'real', note: `Kind: ${RULE_COLLECTIONS[p.key].kind}. An Active rule with its criteria and action filled in acts on matching records; others are inert.` };
  if (ENGINE_OUTPUT[p.key]) return { status: 'Rule engine (runs on records)', level: 'real', note: ENGINE_OUTPUT[p.key] };
  if (ACCESS_PAGES[p.key]) return { status: 'Working (enforced)', level: 'real', note: ACCESS_PAGES[p.key] };
  if (p.kind === 'special') return { status: 'Real data + engine', level: 'real', note: `Dedicated page (${p.special}).` };
  if (p.kind === 'dashboard') return NOT_ENABLED.has(p.key)
    ? { status: 'Reports "not enabled"', level: 'notEnabled', note: 'The feature behind this dashboard does not exist in Cloudbase.' }
    : { status: 'Live metrics', level: 'real', note: 'Computed from real data, cached 60 s.' };
  if (p.kind === 'info') {
    if (SETUP_TOOLS[p.key]) return { status: 'Working tool', level: 'real', note: `Handler: ${SETUP_TOOLS[p.key].handler}.` };
    return EXTERNAL.test(p.key)
      ? { status: 'External product', level: 'external', note: 'A connector to a product Cloudbase does not include; the request is audited and nothing else happens.' }
      : { status: 'Recorded only', level: 'recorded', note: 'The request is audited; the tool engine is not built.' };
  }
  if (p.kind === 'tree') return { status: 'Records', level: 'real', note: 'Hierarchy stored as parent-linked records.' };
  if (consumed && all.length) {
    const dead = all.filter((f) => !consumed.includes(f.key)).map((f) => f.label);
    const full = !dead.length || INTAKE.has(p.key);
    return { status: INTAKE.has(p.key) ? 'Public intake endpoint' : 'Enforced by the platform', level: full ? 'real' : 'partial', note: `${consumed.length} of ${all.length} settings change behaviour${dead.length ? `; stored only: ${dead.join(', ')}` : ''}.` };
  }
  if (p.kind === 'form') return { status: 'Stored only', level: 'stored', note: 'Saved, versioned and audited. No code in Cloudbase reads these values yet.' };
  return p.engine
    ? { status: 'Stored only', level: 'stored', note: 'Records are managed here; the behaviour they describe is not built.' }
    : { status: 'Records', level: 'real', note: 'Managed records (create / edit / delete / search).' };
}
