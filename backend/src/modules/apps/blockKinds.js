import { z } from 'zod';

/**
 * THE registry of page blocks and their buttons. The API validates with it, the repository reads/writes each kind's real settings table from it,
 * and the Studio UI is generated from it (GET /apps/meta). Nothing about a block kind is written down anywhere else.
 * A setting: { key, column, label, kind: int|enum|bool|string|text|fieldKey, default, min?, max?, options? }.
 */
const s = {
  int: (key, column, label, def, min, max) => ({ key, column, label, kind: 'int', default: def, min, max }),
  enum: (key, column, label, options, def) => ({ key, column, label, kind: 'enum', default: def ?? options[0], options: options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)) }),
  bool: (key, column, label, def = false) => ({ key, column, label, kind: 'bool', default: def }),
  string: (key, column, label, def = '', max = 200) => ({ key, column, label, kind: 'string', default: def, max }),
  text: (key, column, label, def = '', max = 20000) => ({ key, column, label, kind: 'text', default: def, max }),
  field: (key, column, label) => ({ key, column, label, kind: 'fieldKey', default: null }),
};

export const ACTION_KINDS = [
  { id: 'add_new', label: 'Add new', icon: 'plus', style: 'primary', openMode: 'drawer', scope: 'block' },
  { id: 'filter', label: 'Filter', icon: 'filter', style: 'default', openMode: 'none', scope: 'block' },
  { id: 'refresh', label: 'Refresh', icon: 'refresh', style: 'default', openMode: 'none', scope: 'block' },
  { id: 'export', label: 'Export', icon: 'download', style: 'default', openMode: 'none', scope: 'block' },
  { id: 'import', label: 'Import', icon: 'upload', style: 'default', openMode: 'modal', scope: 'block' },
  { id: 'print', label: 'Print', icon: 'file-search', style: 'default', openMode: 'none', scope: 'block' },
  { id: 'bulk_edit', label: 'Bulk edit', icon: 'edit', style: 'default', openMode: 'drawer', scope: 'block' },
  { id: 'submit', label: 'Submit', icon: 'check', style: 'primary', openMode: 'none', scope: 'block' },
  { id: 'reset', label: 'Reset', icon: 'restore', style: 'default', openMode: 'none', scope: 'block' },
  { id: 'view', label: 'View', icon: 'eye', style: 'link', openMode: 'drawer', scope: 'row' },
  { id: 'edit', label: 'Edit', icon: 'edit', style: 'link', openMode: 'drawer', scope: 'both' },
  { id: 'duplicate', label: 'Duplicate', icon: 'copy', style: 'link', openMode: 'drawer', scope: 'row' },
  { id: 'delete', label: 'Delete', icon: 'trash', style: 'danger', openMode: 'modal', scope: 'both' },
  { id: 'custom', label: 'Button', icon: 'zap', style: 'default', openMode: 'none', scope: 'both' },
];
export const ACTION_STYLES = ['primary', 'default', 'danger', 'link'];
export const OPEN_MODES = [{ value: 'none', label: 'Do nothing' }, { value: 'drawer', label: 'Drawer' }, { value: 'modal', label: 'Dialog' }, { value: 'page', label: 'Page' }];

const A = (block = [], row = []) => ({ block, row });

export const BLOCK_KINDS = {
  table: { label: 'Table', icon: 'table', description: 'Rows of an object in a table, with a toolbar and row buttons.', needsObject: true, fields: 'columns', table: 'block_table_settings',
    settings: [s.int('pageSize', 'page_size', 'Rows per page', 20, 5, 200), s.enum('density', 'density', 'Row height', ['compact', 'normal', 'comfortable'], 'normal'), s.bool('rowNumbers', 'row_numbers', 'Show row numbers'), s.bool('stickyHeader', 'sticky_header', 'Keep the header in view', true), s.bool('striped', 'striped', 'Striped rows', true), s.bool('selectable', 'selectable', 'Let people select rows'), s.field('defaultSortField', 'default_sort_field', 'Sort by'), s.enum('defaultSortDir', 'default_sort_dir', 'Sort order', [{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }], 'asc')],
    actions: A(['add_new', 'filter', 'refresh', 'bulk_edit', 'delete', 'export', 'import', 'print', 'custom'], ['view', 'edit', 'duplicate', 'delete', 'custom']), defaults: { block: ['add_new', 'filter', 'refresh'], row: ['view', 'edit', 'delete'] }, defaultFields: 6 },
  form: { label: 'Form', icon: 'edit', description: 'Fields of an object to fill in.', needsObject: true, fields: 'fields', table: 'block_form_settings',
    settings: [s.enum('mode', 'mode', 'Creates or edits', [{ value: 'create', label: 'Creates a record' }, { value: 'edit', label: 'Edits a record' }], 'create'), s.enum('layout', 'layout', 'Labels', [{ value: 'vertical', label: 'Above the field' }, { value: 'horizontal', label: 'Beside the field' }], 'vertical'), s.int('columns', 'columns', 'Columns', 1, 1, 3)],
    actions: A(['submit', 'reset', 'custom']), defaults: { block: ['submit', 'reset'], row: [] }, defaultFields: 8 },
  details: { label: 'Details', icon: 'file-search', description: 'One record, shown as label and value pairs.', needsObject: true, fields: 'fields', table: null, settings: [],
    actions: A(['edit', 'print', 'delete', 'custom']), defaults: { block: ['edit'], row: [] }, defaultFields: 8 },
  list: { label: 'Card list', icon: 'grid', description: 'Records as cards.', needsObject: true, fields: 'fields', table: 'block_list_settings',
    settings: [s.field('titleField', 'title_field', 'Card title'), s.int('columns', 'columns', 'Cards per row', 3, 1, 4), s.int('pageSize', 'page_size', 'Cards per page', 12, 4, 100)],
    actions: A(['add_new', 'filter', 'refresh', 'export', 'custom'], ['view', 'edit', 'delete', 'custom']), defaults: { block: ['add_new', 'refresh'], row: ['view'] }, defaultFields: 4 },
  chart: { label: 'Chart', icon: 'poll', description: 'A bar, line, area or pie chart, or one big number.', needsObject: true, fields: null, table: 'block_chart_settings',
    settings: [s.enum('chartType', 'chart_type', 'Chart', [{ value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' }, { value: 'area', label: 'Area' }, { value: 'pie', label: 'Pie' }, { value: 'donut', label: 'Donut' }, { value: 'kpi', label: 'Number' }], 'bar'),
      s.enum('measureFn', 'measure_fn', 'Measure', [{ value: 'count', label: 'Count of records' }, { value: 'sum', label: 'Sum' }, { value: 'avg', label: 'Average' }, { value: 'min', label: 'Smallest' }, { value: 'max', label: 'Largest' }], 'count'), s.field('measureField', 'measure_field', 'Measure field'),
      s.field('dimensionField', 'dimension_field', 'Group by'), s.enum('timeGrain', 'time_grain', 'Group dates by', [{ value: 'none', label: 'Exact value' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }], 'none'),
      s.int('rowLimit', 'row_limit', 'Largest number of groups', 12, 1, 100), s.bool('stacked', 'stacked', 'Stacked'), s.bool('showLegend', 'show_legend', 'Show the legend', true), s.bool('showLabels', 'show_labels', 'Show values on the chart'), s.string('color', 'color', 'Colour', 'brand', 20)],
    actions: A(['refresh', 'custom']), defaults: { block: ['refresh'], row: [] }, defaultFields: 0 },
  kanban: { label: 'Kanban', icon: 'layers', description: 'Cards in columns by a choice field.', needsObject: true, fields: 'fields', table: 'block_kanban_settings',
    settings: [s.field('groupField', 'group_field', 'Columns by'), s.field('titleField', 'title_field', 'Card title')],
    actions: A(['add_new', 'filter', 'refresh', 'custom'], ['view', 'edit', 'custom']), defaults: { block: ['add_new', 'refresh'], row: ['view'] }, defaultFields: 3 },
  calendar: { label: 'Calendar', icon: 'calendar', description: 'Records with dates on a calendar.', needsObject: true, fields: null, table: 'block_calendar_settings',
    settings: [s.field('titleField', 'title_field', 'Event title'), s.field('startField', 'start_field', 'Starts'), s.field('endField', 'end_field', 'Ends'), s.enum('defaultView', 'default_view', 'Opens in', [{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }], 'month')],
    actions: A(['add_new', 'refresh', 'custom']), defaults: { block: ['add_new', 'refresh'], row: [] }, defaultFields: 0 },
  markdown: { label: 'Text', icon: 'type', description: 'Headings, paragraphs and lists written in Markdown.', needsObject: false, fields: null, table: 'block_markdown_content',
    settings: [s.text('content', 'content', 'Content', '## Welcome\n\nWrite **anything** here.')], actions: A(['custom']), defaults: { block: [], row: [] }, defaultFields: 0 },
  iframe: { label: 'Embed', icon: 'external', description: 'Another web page inside this one.', needsObject: false, fields: null, table: 'block_iframe_settings',
    settings: [s.string('url', 'url', 'Address', '', 500), s.bool('allowFullscreen', 'allow_fullscreen', 'Allow full screen')], actions: A(['custom']), defaults: { block: [], row: [] }, defaultFields: 0 },
  filter: { label: 'Filter form', icon: 'filter', description: 'Fields people use to narrow the other blocks.', needsObject: true, fields: 'fields', table: null, settings: [],
    actions: A(['submit', 'reset', 'custom']), defaults: { block: ['submit', 'reset'], row: [] }, defaultFields: 4 },
};
export const BLOCK_KIND_IDS = Object.keys(BLOCK_KINDS);
export const settingsOf = (kind) => BLOCK_KINDS[kind]?.settings ?? [];

function zodFor(d) {
  let z0;
  switch (d.kind) {
    case 'int': z0 = z.number().int().min(d.min ?? -1e9).max(d.max ?? 1e9); break;
    case 'bool': z0 = z.boolean(); break;
    case 'enum': z0 = z.enum(d.options.map((o) => o.value)); break;
    case 'string': z0 = z.string().trim().max(d.max ?? 200); break;
    case 'text': z0 = z.string().max(d.max ?? 20000); break;
    case 'fieldKey': z0 = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/).nullable(); break;
    default: z0 = z.any();
  }
  return z0.optional();
}
/** Validates a block's settings against its kind (unknown keys rejected). Returns { settings } or { issues }. */
export function parseBlockSettings(kind, raw) {
  const k = BLOCK_KINDS[kind];
  if (!k) return { issues: [{ path: 'kind', message: 'Unknown block kind' }] };
  const r = z.object(Object.fromEntries(k.settings.map((d) => [d.key, zodFor(d)]))).strict().safeParse(raw ?? {});
  if (!r.success) return { issues: r.error.issues.map((i) => ({ path: ['settings', ...i.path].join('.'), message: i.message })) };
  const out = Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined));
  if (kind === 'iframe' && out.url && !/^https?:\/\//i.test(out.url)) return { issues: [{ path: 'settings.url', message: 'Use an address starting with http:// or https://' }] };
  return { settings: out };
}
export const defaultSettings = (kind) => Object.fromEntries(settingsOf(kind).map((d) => [d.key, d.default]));

export const blockKindCatalog = () => BLOCK_KIND_IDS.map((id) => { const { label, icon, description, needsObject, fields, settings, actions, defaults } = BLOCK_KINDS[id]; return { id, label, icon, description, needsObject, fields, settings, actions, defaults }; });
