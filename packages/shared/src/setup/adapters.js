import { ROLE_LABELS } from '../constants.js';
import { ALL_OBJECTS, STANDARD_OBJECTS } from '../catalog/standardObjects.js';

/**
 * Setup lists that are NOT stored in the generic record table: they read/write real platform tables.
 * This describes them to the UI (what can be created/edited/deleted, column formats); the API implements them.
 */
const ROLE_OPTIONS = ['Viewer', 'Member', 'Admin'];
const YES_NO = ['Yes', 'No'];
const OBJECT_OPTIONS = [ALL_OBJECTS, ...STANDARD_OBJECTS.map((o) => o.key)];

export const ADAPTER_META = Object.freeze({
  users: {
    searchable: false, loginAs: true, canCreate: true, canEdit: true, canDelete: true, createLabel: 'Invite User', deleteLabel: 'Remove from organisation',
    createFields: [
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, default: 'Member' },
    ],
    editFields: [
      { key: 'role', label: 'Role', type: 'select', options: [...ROLE_OPTIONS, ROLE_LABELS.owner] },
      { key: 'profile', label: 'Profile (name of a profile; blank = role defaults)', type: 'text' },
    ],
  },
  profiles: {
    createLabel: 'New Profile', canCreate: true, canEdit: true, canDelete: true, deleteLabel: 'Delete',
    createFields: [
      { key: 'profile_name', label: 'Profile name', type: 'text', required: true },
      { key: 'user_license', label: 'User license', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
    ],
    editFields: [{ key: 'profile_name', label: 'Profile name', type: 'text' }, { key: 'description', label: 'Description', type: 'text' }],
  },
  'object-settings': {
    createLabel: 'New permission', canCreate: true, canEdit: true, canDelete: true,
    createFields: [
      { key: 'object', label: 'Object', type: 'select', options: OBJECT_OPTIONS, required: true },
      { key: 'permission_set', label: 'Profile or permission set (a new name creates a permission set)', type: 'text', required: true },
      ...['read', 'create', 'edit', 'delete'].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), type: 'select', options: YES_NO, required: true, default: k === 'read' ? 'Yes' : 'No' })),
    ],
    editFields: ['read', 'create', 'edit', 'delete'].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), type: 'select', options: YES_NO })),
  },
  'manage-assignments': {
    createLabel: 'Assign', canCreate: true, canEdit: false, canDelete: true, deleteLabel: 'Remove assignment',
    createFields: [
      { key: 'user', label: 'Person (email)', type: 'text', required: true },
      { key: 'permission_set', label: 'Permission set', type: 'text', required: true },
    ],
  },
  'sharing-defaults': { canCreate: false, canEdit: true, canDelete: false },
  'network-access': { searchable: false, createLabel: 'New range', canCreate: true, canEdit: true, canDelete: true },
  roles: {
    searchable: false, createLabel: 'Add role', canCreate: true, canEdit: true, canDelete: true,
    createFields: [{ key: 'name', label: 'Role name', type: 'text', required: true }],
    editFields: [{ key: 'name', label: 'Role name', type: 'text' }],
  },
  'login-history': { searchable: false, readOnly: true, columnTypes: { login_time: 'datetime' } },
  'session-management': { searchable: false, canDelete: true, deleteLabel: 'End session', columnTypes: { login_time: 'datetime', last_activity: 'datetime' } },
  'scheduled-jobs': { searchable: false, readOnly: true, columnTypes: { submitted: 'datetime' } },
  'view-setup-audit-trail': { searchable: false, readOnly: true, columnTypes: { date: 'datetime' } },
});

export const getAdapterMeta = (key) => ADAPTER_META[key] ?? null;
