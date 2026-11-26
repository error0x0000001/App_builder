import { Button } from '../../../components/ui/Button.jsx';
import { FormField } from '../../../components/ui/FormField.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { ConditionBuilder, buildRefOptions } from './ConditionBuilder.jsx';
import { Disclosure, TagsInput, newId } from './shared.jsx';

const Card = ({ title, onRemove, children, active, onActive }) => (
  <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</p>
      {onActive && <Switch label="On" checked={active !== false} onChange={(e) => onActive(e.target.checked)} />}
      <Button size="icon" variant="ghost" aria-label="Remove" onClick={onRemove}><Icon name="trash" className="size-4" /></Button>
    </div>
    {children}
  </div>
);
const Empty = ({ children }) => <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">{children}</p>;
const patchAt = (list, i, patch) => list.map((x, j) => (j === i ? { ...x, ...patch } : x));

/** Conditional behaviour: show / hide / require / lock / default / limit options, with a condition each. */
export function RulesEditor({ rules, onChange, meta, fields }) {
  const refOptions = buildRefOptions(meta, fields);
  return (
    <div className="space-y-4">
      {rules.length === 0 && <Empty>No rules. The field behaves the same for everyone, always.</Empty>}
      {rules.map((r, i) => {
        const effect = meta.ruleEffects.find((e) => e.id === r.effect);
        const set = (patch) => onChange(patchAt(rules, i, patch));
        return (
          <Card key={r.id} title={effect?.label ?? 'Rule'} active={r.active} onActive={(active) => set({ active })} onRemove={() => onChange(rules.filter((_, j) => j !== i))}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="What it does" options={meta.ruleEffects.map((e) => ({ value: e.id, label: e.label }))} value={r.effect} onChange={(effectId) => set({ effect: effectId })} hint={effect?.help} />
              <Select label="When" options={[{ value: 'both', label: 'Creating and editing' }, { value: 'create', label: 'Only when creating' }, { value: 'edit', label: 'Only when editing' }]} value={r.on ?? 'both'} onChange={(on) => set({ on })} />
            </div>
            {r.effect !== 'clear_when_hidden' && <FormField label="Condition"><ConditionBuilder value={r.condition ?? null} onChange={(condition) => set({ condition })} meta={meta} refOptions={refOptions} /></FormField>}
            {r.effect === 'set_default' && <Input label="Default value" value={r.value ?? ''} onChange={(e) => set({ value: e.target.value })} />}
            {r.effect === 'restrict_options' && <TagsInput label="Options that stay available" value={r.options ?? []} onChange={(options) => set({ options })} />}
            <Input label="Message shown to the person" hint="Optional" value={r.message ?? ''} onChange={(e) => set({ message: e.target.value || undefined })} />
            <Disclosure title={`Who it applies to (${['roles', 'profiles', 'permissionSets', 'workspaces'].filter((k) => r.appliesTo?.[k]?.length).length ? 'limited' : 'everyone'})`}>
                <TagsInput label="Organisation roles" value={r.appliesTo?.roles ?? []} onChange={(roles) => set({ appliesTo: { ...r.appliesTo, roles } })} />
                <TagsInput label="Profiles" value={r.appliesTo?.profiles ?? []} onChange={(profiles) => set({ appliesTo: { ...r.appliesTo, profiles } })} />
                <TagsInput label="Permission sets" value={r.appliesTo?.permissionSets ?? []} onChange={(permissionSets) => set({ appliesTo: { ...r.appliesTo, permissionSets } })} />
              </Disclosure>
          </Card>
        );
      })}
      <Button size="sm" variant="neutral" onClick={() => onChange([...rules, { id: newId(), effect: 'show', condition: null, on: 'both', appliesTo: {}, active: true, order: rules.length * 10 }])}><Icon name="plus" />Add a rule</Button>
    </div>
  );
}

/** Extra validations on top of the type's own checks. */
export function ValidationsEditor({ validations, onChange, meta, fields }) {
  const refOptions = buildRefOptions(meta, fields);
  return (
    <div className="space-y-4">
      {validations.length === 0 && <Empty>No extra validations. The type’s own checks still apply.</Empty>}
      {validations.map((v, i) => {
        const set = (patch) => onChange(patchAt(validations, i, patch));
        return (
          <Card key={v.id} title={meta.validationKinds.find((k) => k.id === v.kind)?.label ?? 'Validation'} active={v.active} onActive={(active) => set({ active })} onRemove={() => onChange(validations.filter((_, j) => j !== i))}>
            <Select label="Kind" options={meta.validationKinds.map((k) => ({ value: k.id, label: k.label }))} value={v.kind} onChange={(kind) => onChange(validations.map((x, j) => (j === i ? { id: x.id, kind, message: x.message, active: x.active, when: x.when ?? null } : x)))} />
            {v.kind === 'pattern' && <><Input label="Pattern" hint="A regular expression, e.g. ^[A-Z]{3}-\d+$" className="font-mono" value={v.pattern ?? ''} onChange={(e) => set({ pattern: e.target.value })} /><Switch label="Ignore upper / lower case" checked={v.flags === 'i'} onChange={(e) => set({ flags: e.target.checked ? 'i' : '' })} /></>}
            {v.kind === 'range' && <div className="grid grid-cols-2 gap-3"><Input label="Minimum" value={v.min ?? ''} onChange={(e) => set({ min: e.target.value || undefined })} /><Input label="Maximum" value={v.max ?? ''} onChange={(e) => set({ max: e.target.value || undefined })} /></div>}
            {(v.kind === 'length' || v.kind === 'count') && <div className="grid grid-cols-2 gap-3"><Input label="Minimum" inputMode="numeric" value={v.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} /><Input label="Maximum" inputMode="numeric" value={v.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>}
            {v.kind === 'date_range' && <div className="grid grid-cols-2 gap-3"><Input label="Earliest" hint="YYYY-MM-DD or today" value={v.min ?? ''} onChange={(e) => set({ min: e.target.value || undefined })} /><Input label="Latest" hint="YYYY-MM-DD or today" value={v.max ?? ''} onChange={(e) => set({ max: e.target.value || undefined })} /></div>}
            {v.kind === 'allowed_values' && <TagsInput label="Allowed values" value={v.values ?? []} onChange={(values) => set({ values })} />}
            {v.kind === 'condition' && <FormField label="Fails when this is true"><ConditionBuilder value={v.condition ?? null} onChange={(condition) => set({ condition: condition ?? undefined })} meta={meta} refOptions={refOptions} /></FormField>}
            {v.kind === 'expression' && <Textarea label="Fails when this formula is true" rows={3} className="font-mono text-xs" hint="For example: EndDate < StartDate" value={v.expression ?? ''} onChange={(e) => set({ expression: e.target.value })} />}
            <Input label="Message" required value={v.message ?? ''} onChange={(e) => set({ message: e.target.value })} />
            <Disclosure title={`Only check when… (${v.when ? 'set' : 'always'})`}><ConditionBuilder value={v.when ?? null} onChange={(when) => set({ when })} meta={meta} refOptions={refOptions} emptyText="Always checked." /></Disclosure>
          </Card>
        );
      })}
      <Button size="sm" variant="neutral" onClick={() => onChange([...validations, { id: newId(), kind: 'pattern', pattern: '', flags: '', message: '', active: true, when: null }])}><Icon name="plus" />Add a validation</Button>
    </div>
  );
}

/** Automatic values. */
export function AutofillEditor({ autofill, onChange, meta, fields }) {
  const refOptions = buildRefOptions(meta, fields);
  return (
    <div className="space-y-4">
      {autofill.length === 0 && <Empty>No automatic values.</Empty>}
      {autofill.map((a, i) => {
        const set = (patch) => onChange(patchAt(autofill, i, patch));
        return (
          <Card key={a.id} title={meta.autofillKinds.find((k) => k.id === a.kind)?.label ?? 'Autofill'} active={a.active} onActive={(active) => set({ active })} onRemove={() => onChange(autofill.filter((_, j) => j !== i))}>
            <Select label="Fill with" options={meta.autofillKinds.map((k) => ({ value: k.id, label: k.label }))} value={a.kind} onChange={(kind) => set({ kind })} />
            {a.kind === 'copy' && <Select label="Copy from" placeholder="Choose a field" options={refOptions.map((o) => ({ value: o.value, label: o.label }))} value={a.source ?? ''} onChange={(source) => set({ source })} />}
            {a.kind === 'formula' && <Textarea label="Formula" rows={3} className="font-mono text-xs" value={a.expression ?? ''} onChange={(e) => set({ expression: e.target.value })} />}
            {a.kind === 'fixed' && <Input label="Value" value={a.value ?? ''} onChange={(e) => set({ value: e.target.value })} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="When" options={[{ value: 'create', label: 'When the record is created' }, { value: 'update', label: 'When it is edited' }, { value: 'change', label: 'When another field changes' }, { value: 'always', label: 'Always' }]} value={a.when ?? 'create'} onChange={(when) => set({ when })} />
              <Select label="Replace an existing value" options={[{ value: 'empty', label: 'Only if the field is empty' }, { value: 'always', label: 'Always' }]} value={a.overwrite ?? 'empty'} onChange={(overwrite) => set({ overwrite })} />
            </div>
            {a.when === 'change' && <Select label="Field that triggers it" options={fields.map((f) => ({ value: f.key, label: f.label }))} value={a.whenField ?? ''} onChange={(whenField) => set({ whenField })} />}
            <div className="space-y-3">
              <Switch label="The person can change the value" checked={a.editable !== false} onChange={(e) => set({ editable: e.target.checked })} />
              <Switch label="Lock it once it is filled" checked={Boolean(a.lockWhenFilled)} onChange={(e) => set({ lockWhenFilled: e.target.checked })} />
              <Switch label="Keep a copy (don’t follow later changes)" checked={a.snapshot !== false} onChange={(e) => set({ snapshot: e.target.checked })} />
              <Switch label="Clear it when the source is cleared" checked={Boolean(a.clearWhenSourceChanges)} onChange={(e) => set({ clearWhenSourceChanges: e.target.checked })} />
            </div>
            <Disclosure title={`Only when… (${a.condition ? 'set' : 'always'})`}><ConditionBuilder value={a.condition ?? null} onChange={(condition) => set({ condition })} meta={meta} refOptions={refOptions} emptyText="Always." /></Disclosure>
          </Card>
        );
      })}
      <Button size="sm" variant="neutral" onClick={() => onChange([...autofill, { id: newId(), kind: 'today', when: 'create', overwrite: 'empty', editable: true, lockWhenFilled: false, clearWhenSourceChanges: false, snapshot: true, condition: null, order: autofill.length * 10, active: true }])}><Icon name="plus" />Add an automatic value</Button>
    </div>
  );
}
