import { useQuery } from '@tanstack/react-query';
import { objectsApi } from '../../../api/endpoints.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { SwitchGroup } from '../../../components/ui/SwitchGroup.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { FormField } from '../../../components/ui/FormField.jsx';
import { ConditionBuilder, buildRefOptions } from './ConditionBuilder.jsx';
import { TagsInput } from './shared.jsx';

const move = (list, i, d) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; return next; };
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/** Rows editor shared by picklist values and status stages. */
function RowsEditor({ rows, onChange, makeRow, columns, label, addLabel }) {
  return (
    <FormField label={label}>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-line bg-surface p-3">
            <div className="grid gap-2 sm:grid-cols-2">{columns.main(row, (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))))}</div>
            <div className="flex flex-wrap items-center gap-4">
              {columns.flags?.(row, (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))))}
              <span className="ml-auto flex">
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => onChange(move(rows, i, -1))}><Icon name="chevron-up" className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => onChange(move(rows, i, 1))}><Icon name="chevron-down" className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="trash" className="size-4" /></Button>
              </span>
            </div>
          </div>
        ))}
        <Button size="sm" variant="neutral" onClick={() => onChange([...rows, makeRow(rows.length)])}><Icon name="plus" />{addLabel}</Button>
      </div>
    </FormField>
  );
}

function OptionsEditor({ value = [], onChange, label, meta }) {
  return (
    <RowsEditor label={label} addLabel="Add value" rows={value} onChange={onChange} makeRow={(n) => ({ value: `value_${n + 1}`, label: `Value ${n + 1}`, active: true })}
      columns={{
        main: (r, set) => <><Input aria-label="Label" placeholder="Label" value={r.label} onChange={(e) => set({ label: e.target.value, ...(r.value === slug(r.label) || /^value_\d+$/.test(r.value) ? { value: slug(e.target.value) || r.value } : {}) })} /><Input aria-label="Stored value" placeholder="Stored value" value={r.value} onChange={(e) => set({ value: e.target.value })} /></>,
        flags: (r, set) => <>
          <div className="w-36"><Select aria-label="Colour" options={meta.colours} value={r.color ?? ''} placeholder="No colour" onChange={(c) => set({ color: c || undefined })} /></div>
          <Switch label="Default" checked={Boolean(r.isDefault)} onChange={(e) => set({ isDefault: e.target.checked })} />
          <Switch label="Active" checked={r.active !== false} onChange={(e) => set({ active: e.target.checked })} />
        </>,
      }} />
  );
}

function StagesEditor({ value = [], onChange, label }) {
  return (
    <RowsEditor label={label} addLabel="Add stage" rows={value} onChange={onChange} makeRow={(n) => ({ value: `stage_${n + 1}`, label: `Stage ${n + 1}` })}
      columns={{
        main: (r, set) => <><Input aria-label="Stage label" placeholder="Label" value={r.label} onChange={(e) => set({ label: e.target.value, ...(/^stage_\d+$/.test(r.value) || r.value === slug(r.label) ? { value: slug(e.target.value) || r.value } : {}) })} /><Input aria-label="Guidance" placeholder="Guidance shown on this stage" value={r.guidance ?? ''} onChange={(e) => set({ guidance: e.target.value || undefined })} /></>,
        flags: (r, set) => <><Switch label="Won" checked={Boolean(r.won)} onChange={(e) => set({ won: e.target.checked })} /><Switch label="Closed" checked={Boolean(r.closed)} onChange={(e) => set({ closed: e.target.checked })} /></>,
      }} />
  );
}

/** Which columns the line-items grid shows: the line object's fields, each a switch. */
function ColumnsEditor({ lineObject, value = [], onChange, label }) {
  const target = useQuery({ queryKey: ['object-by-key', lineObject], enabled: Boolean(lineObject), queryFn: async () => { const list = await objectsApi.list({ q: lineObject, limit: 20 }); const hit = list.items.find((o) => o.key.toLowerCase() === lineObject.toLowerCase()); return hit ? objectsApi.get(hit.id) : null; } });
  if (!lineObject) return <p className="text-sm text-muted">Choose the line object first.</p>;
  if (target.data === null) return <p className="text-sm text-muted">Create the “{lineObject}” object and its fields first.</p>;
  const fields = target.data?.fields ?? [];
  return (
    <SwitchGroup label={label} hint="Leave all off to show every field." value={value.map((c) => c.field)} options={fields.map((f) => ({ value: f.key, label: f.label, description: f.key }))}
      onChange={(keys) => onChange(fields.filter((f) => keys.includes(f.key)).map((f) => value.find((c) => c.field === f.key) ?? { field: f.key }))} />
  );
}

function RollupsEditor({ value = [], onChange, fields, label }) {
  return (
    <RowsEditor label={label} addLabel="Add total" rows={value} onChange={onChange} makeRow={() => ({ target: fields[0]?.key ?? '', fn: 'sum', field: '' })}
      columns={{ main: (r, set) => <><Select aria-label="Parent field" options={fields.map((f) => ({ value: f.key, label: f.label }))} value={r.target} onChange={(target) => set({ target })} /><div className="grid grid-cols-2 gap-2"><Select aria-label="Summary" options={['count', 'sum', 'min', 'max']} value={r.fn} onChange={(fn) => set({ fn })} /><Input aria-label="Line field" placeholder="Line field" value={r.field ?? ''} onChange={(e) => set({ field: e.target.value || undefined })} /></div></> }} />
  );
}

/** One setting, drawn from its descriptor. The descriptors come from the server; nothing about a type is known here. */
function Setting({ desc, value, onChange, ctx }) {
  const label = desc.label;
  const hint = desc.help;
  switch (desc.kind) {
    case 'string': return <Input label={label} hint={hint} required={desc.required} maxLength={desc.max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'text': return <Textarea label={label} hint={hint} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'int': return <Input label={label} hint={hint} inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'decimal': return <Input label={label} hint={hint} inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'bool': return <Switch label={label} description={hint} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case 'enum': return <Select label={label} hint={hint} options={desc.options} value={value ?? desc.default ?? ''} onChange={onChange} />;
    case 'strings': return <TagsInput label={label} hint={hint} value={value ?? []} onChange={onChange} />;
    case 'objectKey': return <Select label={label} hint={hint} required={desc.required} placeholder="Choose an object" options={[...ctx.objects.map((o) => ({ value: o.key, label: `${o.label} (yours)` })), ...ctx.meta.standardObjects.map((o) => ({ value: o.key, label: o.label }))]} value={value ?? ''} onChange={onChange} />;
    case 'fieldKey': return <Select label={label} hint={hint} placeholder="None" options={ctx.fields.map((f) => ({ value: f.key, label: f.label }))} value={value ?? ''} onChange={(v) => onChange(v || undefined)} />;
    case 'fieldKeys': return <TagsInput label={label} hint="Field names" value={value ?? []} onChange={onChange} />;
    case 'expression': return <Textarea label={label} required hint={`Functions: ${ctx.meta.formulaFunctions.join(', ')}. Use field names directly, e.g. Qty * Price.`} rows={4} className="font-mono text-xs" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'condition': return <FormField label={label} hint={hint}><ConditionBuilder value={value ?? null} onChange={onChange} meta={ctx.meta} refOptions={buildRefOptions(ctx.meta, ctx.fields)} emptyText="No filter." /></FormField>;
    case 'options': return <OptionsEditor label={label} value={value} onChange={onChange} meta={ctx.meta} />;
    case 'stages': return <StagesEditor label={label} value={value} onChange={onChange} />;
    case 'columns': return <ColumnsEditor label={label} lineObject={ctx.settings.lineObject} value={value} onChange={onChange} />;
    case 'rollups': return <RollupsEditor label={label} fields={ctx.fields} value={value} onChange={onChange} />;
    default: return null;
  }
}

/** The settings of a field's type. */
export function SettingsForm({ type, settings, onChange, meta, objects, fields }) {
  if (!type.settings.length) return <p className="text-sm text-muted">{type.label} fields have no extra settings.</p>;
  const ctx = { meta, objects, fields, settings };
  return (
    <div className="space-y-5">
      {type.settings.map((desc) => <Setting key={desc.key} desc={desc} ctx={ctx} value={settings[desc.key]} onChange={(v) => onChange({ ...settings, [desc.key]: v })} />)}
    </div>
  );
}
