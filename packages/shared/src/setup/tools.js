import { getAdapterMeta } from './adapters.js';
import { SETUP_PAGES } from './definitions.js';
import { toolInputSchemaFrom } from './schemas.js';

/**
 * Tool pages ("info" pages with a call-to-action). `run` = a real handler exists on the server.
 * Everything else is recorded (audited) and reported honestly as "not active yet" — no fake success.
 */
const recordPages = () => Object.values(SETUP_PAGES).filter((p) => p.kind === 'list' && !getAdapterMeta(p.key));
const nameCounts = () => recordPages().reduce((m, p) => m.set(p.name, (m.get(p.name) ?? 0) + 1), new Map());
/** Human label of a record-backed page; disambiguated with its section when two pages share a name. */
const objectLabel = (p, counts) => (counts.get(p.name) > 1 ? `${p.name} — ${p.path.at(-1)}` : p.name);
/** label -> page key, so selects show names while the server resolves the collection. */
export const importableObjects = () => { const c = nameCounts(); return Object.fromEntries(recordPages().map((p) => [objectLabel(p, c), p.key])); };
const importable = () => Object.keys(importableObjects());

export const SETUP_TOOLS = Object.freeze({
  'data-import-wizard': { handler: 'import', submit: 'Import', fields: () => [
    { key: 'object', label: 'Object', type: 'select', options: importable(), required: true },
    { key: 'csv', label: 'CSV data (first row = column names, up to 5,000 rows)', type: 'textarea', required: true },
  ] },
  'data-loader': { handler: 'export', submit: 'Export', download: true, fields: () => [{ key: 'object', label: 'Object', type: 'select', options: importable(), required: true }] },
  'mass-delete-records': { handler: 'massDelete', submit: 'Delete records', danger: true, fields: () => [
    { key: 'object', label: 'Object', type: 'select', options: importable(), required: true },
    { key: 'confirm', label: 'I understand this permanently deletes every record of this object', type: 'bool', required: true },
  ] },
  'mass-transfer-records': { handler: 'massTransfer', submit: 'Transfer', fields: () => [
    { key: 'object', label: 'Object', type: 'select', options: importable(), required: true },
    { key: 'from', label: 'Transfer from (member email)', type: 'text', required: true },
    { key: 'to', label: 'Transfer to (member email)', type: 'text', required: true },
  ] },
  'test-deliverability': { handler: 'testEmail', submit: 'Send test email', fields: () => [{ key: 'email', label: 'Send to', type: 'text', required: true }] },
  'expire-all-passwords': { handler: 'expirePasswords', submit: 'Expire all passwords', danger: true, fields: () => [
    { key: 'confirm', label: 'Sign everyone else out and ask them to choose a new password', type: 'bool', required: true },
  ] },
  'web-to-case-html-generator': { handler: 'webToCase', submit: 'Generate', fields: () => [
    { key: 'return_url', label: 'Return URL', type: 'text' },
    { key: 'fields', label: 'Fields', type: 'select', options: ['Name, Email, Subject, Description', 'Email, Subject, Description'] },
  ] },
});

export const getToolMeta = (pageKey) => {
  const t = SETUP_TOOLS[pageKey];
  return t ? { ...t, fields: t.fields() } : null;
};

/** Server-side: validate a tool run against its registered definition. */
export const toolInputSchema = (pageKey) => toolInputSchemaFrom(getToolMeta(pageKey));
