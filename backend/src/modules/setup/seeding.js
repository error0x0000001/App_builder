import { labelKey, statusKey } from '@app/shared';
import { config } from '../../shared/config.js';
import fixtures from '../../../seed/setup-fixtures.generated.json' with { type: 'json' };


/** Initial content of a collection for a fresh workspace, derived from the design mock-up fixtures. */
export const hasSeed = (key) => key in fixtures.lists || key in SPECIAL;

const objectRows = () => fixtures.objects.map((o) => ({ label: o.key, data: { label: o.key, api_name: o.key, type: 'Standard', description: `${o.plural} (standard object)` }, status: 'Standard' }));
const fieldRows = () => fixtures.objects.flatMap((o) => o.fields.map((f) => ({ label: f.label, data: { field_label: f.label, object: o.key, data_type: DATA_TYPE[f.type] ?? 'Text', required: f.label === 'Name' } })));
const DATA_TYPE = { text: 'Text', email: 'Email', phone: 'Phone', select: 'Picklist', date: 'Date', number: 'Number', currency: 'Currency', bool: 'Checkbox', lookup: 'Lookup', textarea: 'Text Area', url: 'URL' };
const sharingRows = () => fixtures.objects.map((o) => ({ label: o.key, data: { object: o.key, default_internal_access: 'Public Read/Write', default_external_access: 'Private', grant_access_using_hierarchies: true } })); // open by default; tighten per object

/** Pseudo-collections that are seeded together with a sibling so they never disagree. */
const SPECIAL = {
  'object-manager-objects': { rows: objectRows, group: 'object-manager' },
  'object-manager-fields': { rows: fieldRows, group: 'object-manager' },
  'sharing-defaults': { rows: sharingRows, group: 'sharing-defaults' },
};

export const seedGroup = (key) => SPECIAL[key]?.group ?? key;
export const seedMembers = (group) => Object.keys(SPECIAL).filter((k) => SPECIAL[k].group === group);

/** Object permissions of the standard profiles, as "All objects" rows (always seeded: they define what the profiles mean). */
const grant = (permission_set, read, create, edit, del) => ({ object: 'All', permission_set, read, create, edit, delete: del });
const PROFILE_GRANTS = {
  'object-settings': [grant('System Administrator', 'Yes', 'Yes', 'Yes', 'Yes'), grant('Standard User', 'Yes', 'Yes', 'Yes', 'No'), grant('Read Only', 'Yes', 'No', 'No', 'No'), grant('Minimum Access - API Only', 'No', 'No', 'No', 'No')],
};

const flatRows = (collection) => {
  if (SPECIAL[collection.key]) return SPECIAL[collection.key].rows(); // structural content (standard objects, sharing defaults) is always seeded
  if (!config.SETUP_SEED_SAMPLE_DATA) return (PROFILE_GRANTS[collection.key] ?? []).map((row) => ({ label: String(row.object), status: null, data: row }));
  const label = labelKey(collection); const status = statusKey(collection);
  return [...(fixtures.lists[collection.key] ?? []), ...(PROFILE_GRANTS[collection.key] ?? [])].map((row) => ({ label: String(row[label] ?? ''), status: status ? row[status] ?? null : null, data: row }));
};

/** Roles hierarchy as nodes in depth-first order with a parent index. */
export const roleNodes = () => {
  const out = [];
  const walk = (node, parent) => {
    const index = out.push({ label: node.n, parent, data: { name: node.n, assigned_to: '' } }) - 1;
    for (const kid of node.kids ?? []) walk(kid, index);
  };
  walk(fixtures.trees.roles, null);
  return out;
};

export const seedFlat = flatRows;
