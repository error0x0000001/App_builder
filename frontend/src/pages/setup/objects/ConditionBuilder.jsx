import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { newId } from './shared.jsx';

/** The references a condition can read, grouped for the picker: this object's fields, the person, the context and (for line items) the lines. */
export function buildRefOptions(meta, fields = []) {
  const opts = [
    ...fields.filter((f) => f.active !== false).map((f) => ({ value: `this.${f.key}`, label: `This record · ${f.label}`, field: f })),
    { value: 'user.role', label: 'Person · organisation role' }, { value: 'user.profile', label: 'Person · profile' }, { value: 'user.permissionSets', label: 'Person · permission sets' },
    { value: 'user.workspaceId', label: 'Person · workspace' }, { value: 'user.hierarchyRoles', label: 'Person · roles in the hierarchy' },
    { value: 'context.mode', label: 'Context · create or edit' }, { value: 'context.device', label: 'Context · device' }, { value: 'context.recordType', label: 'Context · record type' }, { value: 'context.isOwner', label: 'Context · is the owner' },
    { value: 'lines.count', label: 'Lines · number of lines' }, { value: 'today', label: 'Today' },
  ];
  return opts;
}

const emptyLeaf = (ref) => ({ ref, operator: 'eq', value: '' });

function ValueInput({ node, operator, field, onChange, disabled }) {
  if (!operator || operator.operands === 0) return null;
  if (field?.type === 'checkbox') return <Switch label={node.value === true ? 'Yes' : 'No'} checked={node.value === true} disabled={disabled} onChange={(e) => onChange({ ...node, value: e.target.checked })} />;
  const choices = field?.type === 'picklist' ? (field.settings?.values ?? []).map((v) => ({ value: v.value, label: v.label })) : field?.type === 'status_path' ? (field.settings?.stages ?? []).map((v) => ({ value: v.value, label: v.label })) : null;
  if (operator.operands === 'list') {
    return <Input aria-label="Values" placeholder="a, b, c" disabled={disabled} value={Array.isArray(node.value) ? node.value.join(', ') : node.value ?? ''} onChange={(e) => onChange({ ...node, value: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />;
  }
  if (operator.operands === 2) {
    const [a = '', b = ''] = Array.isArray(node.value) ? node.value : [];
    return <div className="grid grid-cols-2 gap-2"><Input aria-label="From" placeholder="From" disabled={disabled} value={a} onChange={(e) => onChange({ ...node, value: [e.target.value, b] })} /><Input aria-label="To" placeholder="To" disabled={disabled} value={b} onChange={(e) => onChange({ ...node, value: [a, e.target.value] })} /></div>;
  }
  if (choices) return <Select aria-label="Value" options={choices} placeholder="Choose…" disabled={disabled} value={String(node.value ?? '')} onChange={(v) => onChange({ ...node, value: v })} />;
  return <Input aria-label="Value" disabled={disabled} value={node.value ?? ''} onChange={(e) => onChange({ ...node, value: e.target.value })} />;
}

function Leaf({ node, onChange, onRemove, meta, refOptions, disabled }) {
  const operator = meta.operators.find((o) => o.id === node.operator);
  const field = refOptions.find((o) => o.value === node.ref)?.field;
  const known = refOptions.some((o) => o.value === node.ref);
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <div className="grid grid-cols-[1fr_auto] items-start gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {known ? <Select aria-label="Field" options={refOptions.map((o) => ({ value: o.value, label: o.label }))} disabled={disabled} value={node.ref} onChange={(ref) => onChange({ ...node, ref })} />
            : <Input aria-label="Reference" placeholder="parent.field, line.field, lines.sum.field" disabled={disabled} value={node.ref} onChange={(e) => onChange({ ...node, ref: e.target.value })} />}
          <Select aria-label="Operator" options={meta.operators.map((o) => ({ value: o.id, label: o.label }))} disabled={disabled} value={node.operator} onChange={(op) => onChange({ ...node, operator: op, value: op === 'in' || op === 'nin' ? [] : op === 'between' ? ['', ''] : '' })} />
        </div>
        <Button size="icon" variant="ghost" aria-label="Remove condition" disabled={disabled} onClick={onRemove}><Icon name="x" className="size-4" /></Button>
      </div>
      <ValueInput node={node} operator={operator} field={field} onChange={onChange} disabled={disabled} />
      {!known && <p className="text-xs text-muted">A custom reference: parent.&lt;field&gt;, line.&lt;field&gt;, lines.sum.&lt;field&gt;, this.&lt;lookup&gt;.&lt;field&gt;</p>}
      {known && <button type="button" disabled={disabled} onClick={() => onChange({ ref: '', operator: node.operator, value: node.value })} className="text-xs font-semibold text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">Use another reference</button>}
    </div>
  );
}

function Group({ node, onChange, onRemove, meta, refOptions, disabled, depth }) {
  if (node.op === 'not') return <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">This condition uses “not”, which can’t be edited here yet.</p>;
  const set = (conditions) => onChange({ ...node, conditions });
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted">Match</span>
        <div className="w-28"><Select aria-label="Match" options={[{ value: 'and', label: 'all' }, { value: 'or', label: 'any' }]} disabled={disabled} value={node.op} onChange={(op) => onChange({ ...node, op })} /></div>
        <span className="text-xs font-semibold text-muted">of these</span>
        {onRemove && <Button size="icon" variant="ghost" className="ml-auto" aria-label="Remove group" disabled={disabled} onClick={onRemove}><Icon name="x" className="size-4" /></Button>}
      </div>
      {node.conditions.map((c, i) => (c.op
        ? <Group key={i} node={c} meta={meta} refOptions={refOptions} disabled={disabled} depth={depth + 1} onChange={(n) => set(node.conditions.map((x, j) => (j === i ? n : x)))} onRemove={() => set(node.conditions.filter((_, j) => j !== i))} />
        : <Leaf key={i} node={c} meta={meta} refOptions={refOptions} disabled={disabled} onChange={(n) => set(node.conditions.map((x, j) => (j === i ? n : x)))} onRemove={() => set(node.conditions.filter((_, j) => j !== i))} />))}
      <div className="flex gap-2">
        <Button size="sm" variant="neutral" disabled={disabled} onClick={() => set([...node.conditions, emptyLeaf(refOptions[0]?.value ?? 'user.role')])}><Icon name="plus" />Add condition</Button>
        {depth < 2 && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => set([...node.conditions, { op: 'or', conditions: [emptyLeaf(refOptions[0]?.value ?? 'user.role')] }])}>Add group</Button>}
      </div>
    </div>
  );
}

/** Edits a condition tree. `value` is the tree or null (always true). It only edits the structure; the server evaluates it. */
export function ConditionBuilder({ value, onChange, meta, refOptions, disabled, emptyText = 'Always applies.' }) {
  if (!value) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <span>{emptyText}</span>
        <Button size="sm" variant="neutral" disabled={disabled} onClick={() => onChange({ op: 'and', conditions: [emptyLeaf(refOptions[0]?.value ?? 'user.role')] })}><Icon name="plus" />Add a condition</Button>
      </div>
    );
  }
  const root = value.op ? value : { op: 'and', conditions: [value] };
  return (
    <div className="space-y-2">
      <Group node={root} meta={meta} refOptions={refOptions} disabled={disabled} depth={0} onChange={onChange} />
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>Remove all conditions</Button>
    </div>
  );
}

export { newId };
