import { toolInputSchemaFrom } from './schemas.js';

/**
 * Tool pages ("info" pages with a call-to-action). A tool listed here has a real handler on the server; every other tool page is recorded
 * (audited) and reported honestly as "not active yet" — no fake success.
 */
export const SETUP_TOOLS = Object.freeze({
  'test-deliverability': { handler: 'testEmail', submit: 'Send test email', fields: () => [{ key: 'email', label: 'Send to', type: 'text', required: true }] },
  'expire-all-passwords': { handler: 'expirePasswords', submit: 'Expire all passwords', danger: true, fields: () => [
    { key: 'confirm', label: 'Sign everyone else out and ask them to choose a new password', type: 'bool', required: true },
  ] },
});

export const getToolMeta = (pageKey) => {
  const t = SETUP_TOOLS[pageKey];
  return t ? { ...t, fields: t.fields() } : null;
};

/** Server-side: validate a tool run against its registered definition. */
export const toolInputSchema = (pageKey) => toolInputSchemaFrom(getToolMeta(pageKey));
