import fixtures from '../../../seed/setup-fixtures.generated.json' with { type: 'json' };
import { statusKey } from '@app/shared';
import { decodeCursor, encodeCursor } from '../../shared/pagination.js';

/**
 * Setup lists that have no real table yet are served from the design fixtures (JSON), read-only, so every page still renders.
 * Nothing here is stored or tenant-specific; a page leaves this file the day its real table exists and gets an adapter instead.
 */
export const hasStaticList = (key) => key in fixtures.lists || key in DERIVED;

const DATA_TYPE = { text: 'Text', email: 'Email', phone: 'Phone', select: 'Picklist', date: 'Date', number: 'Number', currency: 'Currency', bool: 'Checkbox', lookup: 'Lookup', textarea: 'Text Area', url: 'URL' };
/** The Object Manager previews are the standard objects and their fields from the fixtures; the debug lists are empty. */
const DERIVED = {
  'object-manager-objects': () => fixtures.objects.map((o) => ({ label: o.key, api_name: o.key, type: 'Standard', description: `${o.plural} (standard object)` })),
  'object-manager-fields': () => fixtures.objects.flatMap((o) => o.fields.map((f) => ({ field_label: f.label, object: o.key, data_type: DATA_TYPE[f.type] ?? 'Text', required: f.label === 'Name' }))),
  'debug-trace-flags': () => [],
  'debug-log-entries': () => [],
};

const rowsOf = (collection) => (DERIVED[collection.key]?.() ?? fixtures.lists[collection.key] ?? []).map((row, i) => ({ id: `${collection.key}:${i}`, ...row }));

const matches = (row, q) => Object.values(row).some((v) => typeof v === 'string' && v.toLowerCase().includes(q));

/** List views that can be answered with a filter: "All …", "Active …", "Inactive …". Others are hidden by the API. */
export function resolveView(collection, label) {
  if (!label || /^all\b|^recent/i.test(label)) return {};
  const status = statusKey(collection);
  const active = /^active\b/i.test(label); const inactive = /^inactive\b/i.test(label);
  if (!active && !inactive) return null;
  if (status) return { status: active ? 'Active' : 'Inactive' };
  const check = collection.columns.find((c) => c.type === 'check' && /active/i.test(c.key));
  return check ? { dataFilter: { [check.key]: active } } : null;
}
export const supportedViews = (collection) => (collection.views ?? []).filter((v) => resolveView(collection, v) !== null);

/** One page of a fixture list: search, view, sort and keyset-like paging by position (the list is small and fixed). */
export function staticPage(collection, { limit, after, q, view, sort, dir, status }) {
  const filter = resolveView(collection, view) ?? {};
  const wanted = status ?? filter.status; const statusCol = statusKey(collection);
  let rows = rowsOf(collection);
  if (wanted && statusCol) rows = rows.filter((r) => r[statusCol] === wanted);
  if (filter.dataFilter) rows = rows.filter((r) => Object.entries(filter.dataFilter).every(([k, v]) => Boolean(r[k]) === v));
  if (q) { const needle = q.toLowerCase(); rows = rows.filter((r) => matches(r, needle)); }
  const sortKey = sort && collection.columns?.some((c) => c.key === sort) ? sort : null;
  if (sortKey) rows = [...rows].sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true }) * (dir === 'desc' ? -1 : 1));
  const offset = decodeCursor(after)?.o ?? 0;
  const items = rows.slice(offset, offset + limit);
  return { items, nextCursor: offset + limit < rows.length ? encodeCursor({ o: offset + limit }) : null, total: rows.length, totalCapped: false };
}
