import { useQuery } from '@tanstack/react-query';
import { objectsApi } from '../../api/endpoints.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { FieldRenderer } from './FieldRenderer.jsx';

/** One row: asks the server to resolve the line object's fields for this row (its values, the parent's values and all rows). */
function Row({ lineObject, row, rows, columns, parentValues, context, disabled, onChange, onRemove, canRemove }) {
  const body = { values: row, parent: parentValues ?? {}, lines: rows, context: { mode: context?.mode ?? 'create', device: 'desktop' } };
  const evaluated = useQuery({ queryKey: ['line-eval', lineObject.object.id, JSON.stringify(body)], queryFn: () => objectsApi.evaluate(lineObject.object.id, body), staleTime: 10_000, placeholderData: (p) => p });
  const fields = evaluated.data?.fields ?? {};
  return (
    <tr className="align-top">
      {columns.map((f) => (
        <td key={f.id} className="px-2 py-2">
          {fields[f.key]?.visible === false ? null : <FieldRenderer compact field={f} state={{ ...fields[f.key], readOnly: disabled || fields[f.key]?.readOnly }} value={row[f.key]} showErrors objectId={lineObject.object.id} onChange={(v) => onChange({ ...row, [f.key]: v })} />}
        </td>
      ))}
      <td className="w-10 px-1 py-2">{canRemove && <Button size="icon" variant="ghost" aria-label="Remove line" disabled={disabled} onClick={onRemove}><Icon name="trash" className="size-4" /></Button>}</td>
    </tr>
  );
}

/** Line items: an editable grid. Columns and limits come from the field's settings; every cell's state comes from the server. */
export function LineItemsGrid({ field, value, onChange, disabled, parentValues, context }) {
  const s = field.settings ?? {};
  const rows = Array.isArray(value) ? value : [];
  const target = useQuery({ queryKey: ['object-by-key', s.lineObject], queryFn: async () => { const list = await objectsApi.list({ q: s.lineObject, limit: 20 }); const hit = list.items.find((o) => o.key.toLowerCase() === s.lineObject.toLowerCase()); return hit ? objectsApi.get(hit.id) : null; }, staleTime: 30_000 });
  if (target.isPending) return <div className="py-4"><Spinner /></div>;
  if (!target.data) return <p className="text-sm text-muted">The line object “{s.lineObject}” was not found.</p>;
  const columns = (s.columns?.length ? s.columns.map((c) => target.data.fields.find((f) => f.key === c.field)).filter(Boolean) : target.data.fields.filter((f) => f.active)).slice(0, 12);
  const canAdd = s.allowAdd !== false && (s.maxRows === undefined || rows.length < s.maxRows);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-surface-2 text-left text-xs font-semibold text-muted"><tr>{columns.map((f) => <th key={f.id} className="px-3 py-2">{f.label}</th>)}<th /></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-muted">No lines yet.</td></tr>}
            {rows.map((row, i) => <Row key={i} lineObject={target.data} row={row} rows={rows} columns={columns} parentValues={parentValues} context={context} disabled={disabled} canRemove={s.allowDelete !== false} onChange={(next) => onChange(rows.map((r, j) => (j === i ? next : r)))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} />)}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="neutral" disabled={disabled || !canAdd} onClick={() => onChange([...rows, {}])}><Icon name="plus" />Add line</Button>
    </div>
  );
}
