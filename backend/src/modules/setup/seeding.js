import { labelKey, statusKey } from '@app/shared';
import fixtures from '../../../seed/setup-fixtures.generated.json' with { type: 'json' };

const ACCESS = ['Private', 'Public Read Only', 'Public Read/Write'];

/** Initial content of a collection for a fresh workspace, derived from the design mock-up fixtures. */
export const hasSeed = (key) => key in fixtures.lists || key in SPECIAL;

const objectRows = () => fixtures.objects.map((o) => ({ label: o.key, data: { label: o.key, api_name: o.key, type: 'Standard', description: `${o.plural} (standard object)` }, status: 'Standard' }));
const fieldRows = () => fixtures.objects.flatMap((o) => o.fields.map((f) => ({ label: f.label, data: { field_label: f.label, object: o.key, data_type: DATA_TYPE[f.type] ?? 'Text', required: f.label === 'Name' } })));
const DATA_TYPE = { text: 'Text', email: 'Email', phone: 'Phone', select: 'Picklist', date: 'Date', number: 'Number', currency: 'Currency', bool: 'Checkbox', lookup: 'Lookup', textarea: 'Text Area', url: 'URL' };
const sharingRows = () => fixtures.objects.map((o, i) => ({ label: o.key, data: { object: o.key, default_internal_access: ACCESS[i % 3 === 0 ? 0 : 1], default_external_access: 'Private', grant_access_using_hierarchies: true } }));

/** Pseudo-collections that are seeded together with a sibling so they never disagree. */
const SPECIAL = {
  'object-manager-objects': { rows: objectRows, group: 'object-manager' },
  'object-manager-fields': { rows: fieldRows, group: 'object-manager' },
  'sharing-defaults': { rows: sharingRows, group: 'sharing-defaults' },
};

export const seedGroup = (key) => SPECIAL[key]?.group ?? key;
export const seedMembers = (group) => Object.keys(SPECIAL).filter((k) => SPECIAL[k].group === group);

const flatRows = (collection) => {
  if (SPECIAL[collection.key]) return SPECIAL[collection.key].rows();
  const label = labelKey(collection); const status = statusKey(collection);
  return (fixtures.lists[collection.key] ?? []).map((row) => ({ label: String(row[label] ?? ''), status: status ? row[status] ?? null : null, data: row }));
};

/** Roles hierarchy as nodes in depth-first order with a parent index. */
export const roleNodes = () => {
  const out = [];
  const walk = (node, parent) => {
    const index = out.push({ label: node.n, parent, data: { name: node.n, assigned_to: node.u ?? '' } }) - 1;
    for (const kid of node.kids ?? []) walk(kid, index);
  };
  walk(fixtures.trees.roles, null);
  return out;
};

export const seedFlat = flatRows;
