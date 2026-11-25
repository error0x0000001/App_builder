/** Tenant roles in ascending order of privilege. */
export const ROLES = Object.freeze(['viewer', 'member', 'admin', 'owner']);
export const ASSIGNABLE_ROLES = Object.freeze(['viewer', 'member', 'admin']);
export const ROLE_LABELS = Object.freeze({ viewer: 'Viewer', member: 'Member', admin: 'Admin', owner: 'Owner' });

/** Tenant (tenant) colour themes. `colors` = [primary, sidebar] preview swatches; the real tokens live in frontend/src/index.css. */
export const DEFAULT_TENANT_THEME = 'untitled';
export const TENANT_THEMES = Object.freeze([
  { id: 'untitled', label: 'Untitled', colors: ['#7f56d9', '#f9fafb'] },
  { id: 'graphite', label: 'Graphite', colors: ['#18181b', '#eef1f5'] },
  { id: 'indigo', label: 'Indigo', colors: ['#4f46e5', '#eef1f5'] },
  { id: 'emerald', label: 'Emerald', colors: ['#059669', '#eef1f5'] },
  { id: 'rose', label: 'Rose', colors: ['#e11d48', '#eef1f5'] },
  { id: 'midnight', label: 'Midnight', colors: ['#1b3a6b', '#00072d'] },
]);
export const TENANT_THEME_IDS = Object.freeze(TENANT_THEMES.map((t) => t.id));

export const hasRole = (role, minimum) => ROLES.indexOf(role) >= ROLES.indexOf(minimum);
/** True when `actorRole` may manage someone holding `role` (owners manage everyone, others only strictly lower roles). */
export const outranks = (actorRole, role) => actorRole === 'owner' || ROLES.indexOf(role) < ROLES.indexOf(actorRole);

export const OTP_LENGTH = 6;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const TEAM_SIZES = Object.freeze(['1 - 15', '16 - 50', '51 - 200', '201 - 1000', '1000+']);
export const COUNTRIES = Object.freeze([
  'India', 'United States', 'United Kingdom', 'Germany', 'Australia', 'Canada', 'France', 'Singapore',
]);
export const INDUSTRIES = Object.freeze([
  'Technology', 'Finance', 'Healthcare', 'Education', 'Retail', 'Manufacturing', 'Media', 'Other',
]);
export const TIMEZONES = Object.freeze([
  'Asia/Kolkata', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Singapore', 'Australia/Sydney', 'UTC',
]);
export const ONBOARDING_ROLES = Object.freeze(['Sales', 'Service', 'Marketing', 'HR / People', 'IT / Admin', 'Executive']);

/** Machine-readable API error codes the client branches on. */
export const ERROR_CODES = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CODE: 'INVALID_CODE',
  INVALID_TOKEN: 'INVALID_TOKEN',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  INTERNAL: 'INTERNAL_ERROR',
});

/** Security audit event types (also drives the login-history UI labels). */
export const AUDIT_EVENTS = Object.freeze({
  SIGNUP: 'signup',
  EMAIL_VERIFIED: 'email_verified',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  LOGOUT_ALL: 'logout_all',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET: 'password_reset',
  PASSWORD_CHANGED: 'password_changed',
  MFA_ENABLED: 'mfa_enabled',
  MFA_DISABLED: 'mfa_disabled',
  MFA_FAILED: 'mfa_failed',
  RECOVERY_CODE_USED: 'recovery_code_used',
  SESSION_REVOKED: 'session_revoked',
  REFRESH_REUSE: 'refresh_token_reuse',
  ACCOUNT_LOCKED: 'account_locked',
  OAUTH_LOGIN: 'oauth_login',
  INVITATION_ACCEPTED: 'invitation_accepted',
  IMPERSONATION: 'impersonation',
});

export const AUDIT_EVENT_LABELS = Object.freeze({
  signup: 'Account created',
  email_verified: 'Email verified',
  login_success: 'Signed in',
  login_failed: 'Failed sign-in attempt',
  logout: 'Signed out',
  logout_all: 'Signed out of all devices',
  password_reset_requested: 'Password reset requested',
  password_reset: 'Password reset',
  password_changed: 'Password changed',
  mfa_enabled: 'Two-factor authentication enabled',
  mfa_disabled: 'Two-factor authentication disabled',
  mfa_failed: 'Failed two-factor attempt',
  recovery_code_used: 'Recovery code used',
  session_revoked: 'Session revoked',
  refresh_token_reuse: 'Suspicious session activity — session revoked',
  account_locked: 'Account temporarily locked',
  oauth_login: 'Signed in with Google',
  invitation_accepted: 'Joined an organisation',
  impersonation: 'An administrator signed in as you',
});
