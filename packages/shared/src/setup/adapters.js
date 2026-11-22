import { ROLE_LABELS } from '../constants.js';

/**
 * Setup lists that are NOT stored in the generic record table: they read/write real platform tables.
 * This describes them to the UI (what can be created/edited/deleted, column formats); the API implements them.
 */
const ROLE_OPTIONS = ['Viewer', 'Member', 'Admin'];

export const ADAPTER_META = Object.freeze({
  users: {
    searchable: false, canCreate: true, canEdit: true, canDelete: true, createLabel: 'Invite User', deleteLabel: 'Remove from workspace',
    createFields: [
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, default: 'Member' },
    ],
    editFields: [{ key: 'role', label: 'Role', type: 'select', options: [...ROLE_OPTIONS, ROLE_LABELS.owner] }],
  },
  'login-history': { searchable: false, readOnly: true, columnTypes: { login_time: 'datetime' } },
  'session-management': { searchable: false, canDelete: true, deleteLabel: 'End session', columnTypes: { login_time: 'datetime', last_activity: 'datetime' } },
  'view-setup-audit-trail': { searchable: false, readOnly: true, columnTypes: { date: 'datetime' } },
});

export const getAdapterMeta = (key) => ADAPTER_META[key] ?? null;
