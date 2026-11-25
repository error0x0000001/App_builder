import { ROLE_LABELS } from '@app/shared';

/**
 * Declarative email templates: each returns content only; layout/escaping live in renderEmail.
 * Add a template by adding an entry — no HTML duplication.
 */
export const TEMPLATES = Object.freeze({
  /** Generic message: workflow email alerts, auto-response rules, approval requests. */
  notification: ({ subject, body }) => ({ subject, heading: subject, paragraphs: String(body ?? '').split(/\n{2,}/).filter(Boolean), footnote: 'Sent by a Quelli automation rule.' }),
  test_email: ({ tenant }) => ({
    subject: 'Quelli test email',
    heading: 'Email deliverability test',
    paragraphs: [`This message confirms that email from ${tenant} is being delivered.`],
    footnote: 'You can ignore this message.',
  }),
  password_expired: ({ url, ttlMinutes }) => ({
    subject: 'Choose a new Quelli password',
    heading: 'Your password has expired',
    paragraphs: ['An administrator expired all passwords in your organisation. You were signed out everywhere — choose a new password to continue.'],
    cta: { label: 'Choose a new password', url },
    footnote: `The link expires in ${ttlMinutes} minutes and can be used once.`,
  }),
  verify_email: ({ code, ttlMinutes }) => ({
    subject: `${code} is your Quelli verification code`,
    heading: 'Verify your email',
    paragraphs: ['Enter this 6-digit code to finish creating your account.'],
    code,
    footnote: `The code expires in ${ttlMinutes} minutes. If you didn’t sign up, you can ignore this email.`,
  }),
  password_reset: ({ url, ttlMinutes }) => ({
    subject: 'Reset your Quelli password',
    heading: 'Reset your password',
    paragraphs: ['We received a request to reset your password. Use the button below to choose a new one.'],
    cta: { label: 'Reset password', url },
    footnote: `The link expires in ${ttlMinutes} minutes and can be used once. If you didn’t ask for this, ignore this email — your password won’t change.`,
  }),
  password_changed: () => ({
    subject: 'Your Quelli password was changed',
    heading: 'Password changed',
    paragraphs: ['The password for your account was just changed and all other devices were signed out.'],
    footnote: 'If this wasn’t you, reset your password immediately and contact your administrator.',
  }),
  account_exists: ({ loginUrl, resetUrl }) => ({
    subject: 'You already have a Quelli account',
    heading: 'You already have an account',
    paragraphs: ['Someone tried to create an account with this email address, but one already exists.'],
    cta: { label: 'Sign in', url: loginUrl },
    footnote: `Forgot your password? Reset it here: ${resetUrl}`,
  }),
  account_locked: ({ minutes }) => ({
    subject: 'Your Quelli account was temporarily locked',
    heading: 'Account temporarily locked',
    paragraphs: [`We locked your account for ${minutes} minutes after several failed sign-in attempts.`],
    footnote: 'If this wasn’t you, reset your password after the lock expires.',
  }),
  mfa_changed: ({ enabled }) => ({
    subject: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`,
    heading: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`,
    paragraphs: [`Two-factor authentication was just ${enabled ? 'turned on' : 'turned off'} for your account.`],
    footnote: 'If this wasn’t you, reset your password immediately.',
  }),
  invitation: ({ inviterName, tenantName, role, url, ttlDays }) => ({
    subject: `${inviterName} invited you to ${tenantName} on Quelli`,
    heading: 'You’ve been invited',
    paragraphs: [`${inviterName} invited you to join ${tenantName} as ${ROLE_LABELS[role] ?? role}.`],
    cta: { label: 'Accept invitation', url },
    footnote: `The invitation expires in ${ttlDays} days. If you weren’t expecting it, you can ignore this email.`,
  }),
});
