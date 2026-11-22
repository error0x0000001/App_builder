import registry from './registry.generated.json' with { type: 'json' };
/** Setup registry: generated from the design mock-up (tools/setup/build-registry.cjs). One definition drives UI + API + validation. */
export const SETUP_TREE = registry.tree;
export const SETUP_PAGES = registry.pages;
export const SETUP_COUNTS = registry.counts;
export const getSetupPage = (key) => SETUP_PAGES[key] ?? null;

/** Collections that back special pages (not in the tree). Same shape as a list page. */
export const INTERNAL_COLLECTIONS = Object.freeze({
  'debug-trace-flags': { key: 'debug-trace-flags', name: 'User Trace Flags', kind: 'list', newLabel: 'New', columns: [
    { key: 'monitored_user', label: 'Monitored User', type: 'link' }, { key: 'debug_level', label: 'Debug Level', type: 'select', options: ['SFDC_DevConsole', 'Finest', 'Info', 'Warn'] },
    { key: 'start_date', label: 'Start Date', type: 'text' }, { key: 'expiration_date', label: 'Expiration Date', type: 'text' }], views: [], bulkActions: [] },
  'debug-log-entries': { key: 'debug-log-entries', name: 'Debug Logs', kind: 'list', readOnly: true, newLabel: null, columns: [
    { key: 'user', label: 'User', type: 'link' }, { key: 'application', label: 'Application', type: 'text' }, { key: 'operation', label: 'Operation', type: 'text' },
    { key: 'time', label: 'Time', type: 'text' }, { key: 'status', label: 'Status', type: 'status', options: ['Success', 'Assertion Failed', 'Fatal Error'] }, { key: 'size', label: 'Log Size', type: 'text' }], views: [], bulkActions: [] },
  'sharing-defaults': { key: 'sharing-defaults', name: 'Organization-Wide Defaults', kind: 'list', newLabel: null, columns: [
    { key: 'object', label: 'Object', type: 'link' },
    { key: 'default_internal_access', label: 'Default Internal Access', type: 'select', options: ['Private', 'Public Read Only', 'Public Read/Write', 'Public Read/Write/Transfer', 'Public Full Access', 'Controlled by Parent'] },
    { key: 'default_external_access', label: 'Default External Access', type: 'select', options: ['Private', 'Public Read Only', 'Controlled by Parent'] },
    { key: 'grant_access_using_hierarchies', label: 'Grant Access Using Hierarchies', type: 'check' }], views: [], bulkActions: [] },
  'object-manager-objects': { key: 'object-manager-objects', name: 'Objects', kind: 'list', newLabel: 'Create', columns: [
    { key: 'label', label: 'Label', type: 'link' }, { key: 'api_name', label: 'API Name', type: 'text' }, { key: 'type', label: 'Type', type: 'status', options: ['Standard', 'Custom'] }, { key: 'description', label: 'Description', type: 'text' }], views: [], bulkActions: [] },
  'object-manager-fields': { key: 'object-manager-fields', name: 'Fields & Relationships', kind: 'list', newLabel: 'New', columns: [
    { key: 'field_label', label: 'Field Label', type: 'link' }, { key: 'object', label: 'Object', type: 'text' },
    { key: 'data_type', label: 'Data Type', type: 'select', options: ['Text', 'Text Area', 'Number', 'Currency', 'Percent', 'Checkbox', 'Date', 'Date/Time', 'Email', 'Phone', 'URL', 'Picklist', 'Lookup', 'Formula'] },
    { key: 'required', label: 'Required', type: 'check' }], views: [], bulkActions: [] },
});

/** Everything that stores records: tree list pages + internal collections. */
export const getCollection = (key) => {
  const page = SETUP_PAGES[key];
  if (page?.kind === 'list') return page;
  if (page?.kind === 'tree') return TREE_COLLECTION(page);
  return INTERNAL_COLLECTIONS[key] ?? null;
};
const TREE_COLLECTION = (page) => ({ key: page.key, name: page.name, kind: 'list', newLabel: 'Add', columns: [{ key: 'name', label: 'Role', type: 'link' }, { key: 'assigned_to', label: 'Assigned To', type: 'text' }], views: [], bulkActions: [] });

/** Flatten the tree to [{ key, name, path }] (used by search / quick find). */
export const SETUP_INDEX = Object.values(SETUP_PAGES).map(({ key, name, path, kind }) => ({ key, name, path, kind }));

