/**
 * Sample data for blocks while record tables don't exist. Deterministic (seeded by the block id), shaped exactly like the real thing,
 * and sorted / searched / paged here on the server — so the screens behave the way they will with real records. Always flagged `sample: true`.
 */
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const rng = (seed) => { let x = seed || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x >>> 0) / 4294967296; }; };
const NAMES = ['Priya Sharma', 'Marcus Chen', 'Elena Rossi', 'Tomás Alvarez', 'Aisha Khan', 'Noah Fischer', 'Mei Tanaka', 'Oliver Grant'];
const COMPANIES = ['Northwind Traders', 'Acme Corp', 'Globex', 'Initech', 'Umbrella Labs', 'Stark Supply', 'Wayne Freight', 'Hooli'];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const day = (offset, at = new Date()) => { const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + offset)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

/** One sample cell for a field. Choices carry their label and colour; everything else is a plain value. */
export function sampleValue(field, i, r) {
  const s = field.settings ?? {};
  const choice = (list) => { const o = list[Math.floor(r() * list.length)] ?? { value: '', label: '' }; return { value: o.value, label: o.label ?? o.value, color: o.color }; };
  switch (field.type) {
    case 'text': case 'barcode': return /name|title|company|account|customer/i.test(field.key + field.label) ? COMPANIES[(i + Math.floor(r() * 3)) % COMPANIES.length] : `${field.label} ${i + 1}`;
    case 'long_text': case 'rich_text': case 'html': return `Sample ${field.label.toLowerCase()} for row ${i + 1}.`;
    case 'email': return `${NAMES[i % NAMES.length].split(' ')[0].toLowerCase()}${i + 1}@example.com`;
    case 'phone': return `+1 555 01${pad(10 + i)}`;
    case 'url': return `https://example.com/${i + 1}`;
    case 'number': return Math.floor(r() * 500) + 1;
    case 'decimal': case 'slider': return (r() * 1000).toFixed(2);
    case 'currency': return `${s.currencyCode ?? 'USD'} ${(r() * 5000).toFixed(2)}`;
    case 'percent': return `${(r() * 100).toFixed(1)}%`;
    case 'rating': return 1 + Math.floor(r() * 5);
    case 'checkbox': return r() > 0.4;
    case 'date': return day(Math.floor(r() * 60) - 30);
    case 'date_time': return `${day(Math.floor(r() * 60) - 30)}T${pad(8 + Math.floor(r() * 9))}:${pad(Math.floor(r() * 4) * 15)}:00`;
    case 'time': return `${pad(8 + Math.floor(r() * 9))}:${pad(Math.floor(r() * 4) * 15)}`;
    case 'duration': return `${1 + Math.floor(r() * 8)} ${s.unit ?? 'hours'}`;
    case 'picklist': return choice((s.values ?? []).filter((v) => v.active !== false));
    case 'status_path': return choice(s.stages ?? []);
    case 'multi_picklist': return (s.values ?? []).slice(0, 2).map((v) => v.label).join(', ');
    case 'tags': return (s.allowed?.length ? s.allowed : ['new', 'priority']).slice(0, 2).join(', ');
    case 'user': return { name: NAMES[(i + Math.floor(r() * 3)) % NAMES.length] };
    case 'lookup': case 'master_detail': case 'many_to_many': case 'polymorphic': return COMPANIES[(i + Math.floor(r() * 4)) % COMPANIES.length];
    case 'colour': return ['#7f56d9', '#1570ef', '#12b76a', '#f79009', '#f04438'][i % 5];
    case 'ip_address': return `10.0.${i % 255}.${10 + i}`;
    case 'location': return `${(37 + r()).toFixed(3)}, ${(-122 + r()).toFixed(3)}`;
    case 'address': return `${10 + i} Sample Street, Springfield`;
    case 'file': case 'photo': case 'signature': return `document-${i + 1}.pdf`;
    case 'auto_number': return (s.format ?? 'N-{0000}').replace(/\{(0+)\}/g, (_, z) => pad((s.start ?? 1) + i, z.length)).replace(/\{YYYY\}/g, String(new Date().getUTCFullYear()));
    case 'formula': case 'rollup': return (r() * 100).toFixed(2);
    case 'password': return '••••••••';
    default: return `${field.label} ${i + 1}`;
  }
}
const comparable = (v) => (v && typeof v === 'object' ? (v.label ?? v.name ?? '') : v);
const searchable = (v) => String(comparable(v) ?? '').toLowerCase();

export function sampleTable({ block, fields, query }) {
  const cols = fields.length ? fields : [];
  const total = 137;
  const seed = hash(block.id);
  let rows = Array.from({ length: total }, (_, i) => { const r = rng(seed + i * 7919); return { id: `${block.id.slice(0, 8)}-${i + 1}`, cells: Object.fromEntries(cols.map((f) => [f.key, sampleValue(f, i, r)])) }; });
  if (query.q) rows = rows.filter((row) => Object.values(row.cells).some((v) => searchable(v).includes(query.q.toLowerCase())));
  const sortKey = query.sort ?? block.settings?.defaultSortField; const dir = (query.dir ?? block.settings?.defaultSortDir ?? 'asc') === 'desc' ? -1 : 1;
  if (sortKey && cols.some((f) => f.key === sortKey)) rows.sort((a, b) => { const x = comparable(a.cells[sortKey]); const y = comparable(b.cells[sortKey]); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir; });
  const pageSize = query.pageSize ?? block.settings?.pageSize ?? 20; const page = Math.max(1, query.page ?? 1);
  return { columns: cols.map((f) => ({ key: f.key, label: f.label, type: f.type, width: f.widthPx ?? null, fixed: Boolean(f.fixed) })), rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, sample: true };
}

export function sampleChart({ block, objectFields }) {
  const s = block.settings ?? {}; const r = rng(hash(block.id));
  const dim = objectFields.find((f) => f.key === s.dimensionField);
  let labels;
  if (dim?.type === 'picklist') labels = (dim.settings?.values ?? []).map((v) => v.label);
  else if (dim && ['date', 'date_time'].includes(dim.type) || s.timeGrain !== 'none') { const n = Math.min(s.rowLimit ?? 12, s.timeGrain === 'day' ? 14 : 12); labels = Array.from({ length: n }, (_, i) => (s.timeGrain === 'year' ? String(2026 - n + 1 + i) : s.timeGrain === 'day' ? day(i - n + 1) : `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i % 12]}${s.timeGrain === 'week' ? ` W${i + 1}` : ''}`)); }
  else labels = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E'];
  labels = labels.slice(0, s.rowLimit ?? 12);
  const scale = s.measureFn === 'count' ? 60 : 5000;
  const series = labels.map((label) => ({ label, value: Math.round(r() * scale + scale * 0.2) }));
  const total = series.reduce((n, x) => n + x.value, 0);
  return { type: s.chartType ?? 'bar', series, total, kpi: { value: total, delta: Math.round((r() - 0.3) * 20) }, measure: { fn: s.measureFn ?? 'count', field: s.measureField ?? null }, dimension: s.dimensionField ?? null, sample: true };
}

export function sampleKanban({ block, objectFields, fields }) {
  const s = block.settings ?? {}; const group = objectFields.find((f) => f.key === s.groupField) ?? objectFields.find((f) => ['picklist', 'status_path'].includes(f.type));
  const values = group ? (group.type === 'status_path' ? group.settings?.stages : group.settings?.values) ?? [] : [];
  const lanes = values.length ? values : [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'In progress' }, { value: 'done', label: 'Done' }];
  const titleField = objectFields.find((f) => f.key === s.titleField) ?? objectFields.find((f) => f.type === 'text') ?? objectFields[0];
  const r = rng(hash(block.id));
  return { columns: lanes.map((lane, li) => ({ value: lane.value, label: lane.label ?? lane.value, color: lane.color ?? null, cards: Array.from({ length: 2 + ((li + 1) % 3) }, (_, i) => ({ id: `${lane.value}-${i}`, title: titleField ? String(comparable(sampleValue(titleField, li * 5 + i, r))) : `Card ${i + 1}`, fields: fields.slice(0, 3).filter((f) => f.key !== titleField?.key).map((f) => ({ label: f.label, type: f.type, value: sampleValue(f, i, r) })) })) })), sample: true };
}

export function sampleCalendar({ block, objectFields, now = new Date() }) {
  const s = block.settings ?? {}; const r = rng(hash(block.id));
  const title = objectFields.find((f) => f.key === s.titleField) ?? objectFields.find((f) => f.type === 'text');
  const month = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  const daysIn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const events = Array.from({ length: 9 }, (_, i) => { const d = 1 + Math.floor(r() * daysIn); const len = Math.floor(r() * 3); return { id: `e${i}`, title: title ? String(comparable(sampleValue(title, i, r))) : `Event ${i + 1}`, start: `${month}-${pad(d)}`, end: `${month}-${pad(Math.min(daysIn, d + len))}` }; });
  return { month, view: s.defaultView ?? 'month', events, sample: true };
}

export function sampleRecordFields({ block, fields }) {
  const r = rng(hash(block.id));
  return { fields: fields.map((f, i) => ({ key: f.key, label: f.label, type: f.type, value: sampleValue(f, i, r) })), sample: true };
}

export function sampleCards({ block, fields, objectFields, query }) {
  const s = block.settings ?? {}; const title = objectFields.find((f) => f.key === s.titleField) ?? fields[0] ?? objectFields[0];
  const table = sampleTable({ block: { ...block, settings: { pageSize: s.pageSize ?? 12 } }, fields: [...new Map([title, ...fields].filter(Boolean).map((f) => [f.key, f])).values()], query });
  return { cards: table.rows.map((row) => ({ id: row.id, title: title ? comparable(row.cells[title.key]) : row.id, fields: fields.filter((f) => f.key !== title?.key).map((f) => ({ key: f.key, label: f.label, type: f.type, value: row.cells[f.key] })) })), total: table.total, page: table.page, pageSize: table.pageSize, sample: true };
}
