import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { objectsApi } from '../../../api/endpoints.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Sheet } from '../../../components/ui/Sheet.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { AutofillEditor, RulesEditor, ValidationsEditor } from './BehaviourEditors.jsx';
import { SettingsForm } from './SettingsForm.jsx';
import { ErrorBox } from './shared.jsx';

const keyFrom = (label) => { const words = label.trim().replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean); const k = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join(''); return /^[A-Za-z]/.test(k) ? k.slice(0, 40) : k ? `f${k}`.slice(0, 40) : ''; };
const defaultsOf = (type) => Object.fromEntries(type.settings.filter((s) => s.default !== undefined).map((s) => [s.key, s.default]));
const DEFAULTABLE = ['text', 'long_text', 'email', 'phone', 'url', 'number', 'decimal', 'currency', 'percent', 'date', 'time', 'picklist', 'checkbox'];

/** Step 1 of a new field: pick the type. Grouped; each card says how it is stored. */
function TypePicker({ types, onPick }) {
  const groups = [...new Set(types.map((t) => t.group))];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {types.filter((t) => t.group === g).map((t) => (
              <button key={t.id} type="button" onClick={() => onPick(t)} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left outline-none transition-colors hover:border-accent hover:bg-accent-soft focus-visible:ring-4 focus-visible:ring-ring">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface text-ink"><Icon name={t.icon} className="size-4" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{t.label}</span><span className="block truncate text-xs text-muted">{t.stored}</span></span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Create or edit a field. Every option comes from the server's type registry; saving validates there and shows what it says. */
export function FieldSheet({ open, onClose, objectId, field, meta, fields }) {
  const editing = Boolean(field);
  const queryClient = useQueryClient();
  const objects = useQuery({ queryKey: ['objects', 'all-keys'], queryFn: () => objectsApi.list({ limit: 200 }), staleTime: 30_000 });
  const [type, setType] = useState(() => (field ? meta.fieldTypes.find((t) => t.id === field.type) : null));
  const [draft, setDraft] = useState(() => field ?? null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [tab, setTab] = useState('general');
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const pick = (t) => { setType(t); setDraft({ key: '', label: '', type: t.id, helpText: '', description: '', required: Boolean(t.forceRequired), unique: false, indexed: false, encrypted: Boolean(t.alwaysEncrypted), readOnly: false, defaultValue: null, section: '', active: true, settings: defaultsOf(t), rules: [], validations: [], autofill: [] }); };

  const save = useMutation({
    mutationFn: () => {
      const { id, objectId: _o, createdAt, updatedAt, sortOrder, system, ...rest } = draft;
      const body = { ...rest, defaultValue: draft.defaultValue === '' ? null : draft.defaultValue, settings: Object.fromEntries(Object.entries(draft.settings ?? {}).filter(([, v]) => v !== undefined && v !== '')) };
      if (editing) { delete body.key; delete body.type; return objectsApi.updateField(objectId, field.id, body); }
      return objectsApi.createField(objectId, body);
    },
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['object', objectId] }), queryClient.invalidateQueries({ queryKey: ['fields', objectId] }), queryClient.invalidateQueries({ queryKey: ['objects'] })]); onClose(); },
  });
  const otherFields = useMemo(() => (fields ?? []).filter((f) => f.id !== field?.id), [fields, field]);

  const body = !draft ? <TypePicker types={meta.fieldTypes} onPick={pick} /> : (
    <div className="space-y-5">
      <ErrorBox error={save.error} />
      <Tabs label="Field sections" value={tab} onChange={setTab} tabs={[{ id: 'general', label: 'General' }, { id: 'settings', label: 'Settings' }, { id: 'rules', label: `Behaviour${draft.rules?.length ? ` (${draft.rules.length})` : ''}` }, { id: 'validation', label: `Validation${draft.validations?.length ? ` (${draft.validations.length})` : ''}` }, { id: 'autofill', label: `Autofill${draft.autofill?.length ? ` (${draft.autofill.length})` : ''}` }]} />
      {tab === 'general' && (
        <div className="space-y-5">
          <Input label="Label" required value={draft.label} onChange={(e) => set({ label: e.target.value, ...(!editing && !keyTouched ? { key: keyFrom(e.target.value) } : {}) })} />
          <Input label="API name" required disabled={editing} hint={editing ? 'The API name can’t change.' : 'Letters, numbers and underscores. It can’t be changed later.'} value={draft.key} onChange={(e) => { setKeyTouched(true); set({ key: e.target.value }); }} />
          <Input label="Section" hint="Fields with the same section are grouped on the form." value={draft.section ?? ''} onChange={(e) => set({ section: e.target.value })} />
          <Input label="Help text" value={draft.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value })} />
          <Textarea label="Description" hint="For administrators only." rows={2} value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
          {DEFAULTABLE.includes(draft.type) && (draft.type === 'checkbox'
            ? <Switch label="Checked by default" checked={draft.defaultValue === true} onChange={(e) => set({ defaultValue: e.target.checked })} />
            : draft.type === 'picklist' ? <Select label="Default value" placeholder="None" options={(draft.settings?.values ?? []).map((v) => ({ value: v.value, label: v.label }))} value={draft.defaultValue ?? ''} onChange={(v) => set({ defaultValue: v || null })} />
              : <Input label="Default value" value={draft.defaultValue ?? ''} onChange={(e) => set({ defaultValue: e.target.value })} />)}
          <div className="space-y-4 border-t border-line pt-4">
            <Switch label="Required" description="A value must be given." checked={draft.required || Boolean(type.forceRequired)} disabled={type.computed || type.forceRequired} onChange={(e) => set({ required: e.target.checked })} />
            <Switch label="Unique" description={type.unique ? 'No two records can have the same value.' : `${type.label} fields can’t be unique.`} checked={draft.unique} disabled={!type.unique || draft.encrypted} onChange={(e) => set({ unique: e.target.checked })} />
            <Switch label="Indexed" description="Faster filtering and sorting." checked={draft.indexed} disabled={type.computed || draft.encrypted} onChange={(e) => set({ indexed: e.target.checked })} />
            <Switch label="Encrypted" description={type.alwaysEncrypted ? 'Secrets are always encrypted.' : type.encryptable ? 'Stored as an encrypted value. It can’t be searched, sorted, indexed or made unique.' : `${type.label} fields can’t be encrypted.`} checked={draft.encrypted || Boolean(type.alwaysEncrypted)} disabled={!type.encryptable || Boolean(type.alwaysEncrypted)} onChange={(e) => set({ encrypted: e.target.checked, ...(e.target.checked ? { unique: false, indexed: false } : {}) })} />
            <Switch label="Read-only" description="Nobody can edit it by hand." checked={draft.readOnly || type.computed} disabled={type.computed} onChange={(e) => set({ readOnly: e.target.checked })} />
            <Switch label="Active" description="Inactive fields are hidden but keep their data." checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
          </div>
        </div>
      )}
      {tab === 'settings' && <SettingsForm type={type} settings={draft.settings ?? {}} onChange={(settings) => set({ settings })} meta={meta} objects={objects.data?.items ?? []} fields={otherFields} />}
      {tab === 'rules' && <RulesEditor rules={draft.rules ?? []} onChange={(rules) => set({ rules })} meta={meta} fields={[...otherFields, ...(draft.key ? [{ key: draft.key, label: draft.label || draft.key, type: draft.type, settings: draft.settings }] : [])]} />}
      {tab === 'validation' && <ValidationsEditor validations={draft.validations ?? []} onChange={(validations) => set({ validations })} meta={meta} fields={otherFields} />}
      {tab === 'autofill' && <AutofillEditor autofill={draft.autofill ?? []} onChange={(autofill) => set({ autofill })} meta={meta} fields={otherFields} />}
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} width="w-[36rem]" icon={type?.icon ?? 'layers'} title={editing ? `Edit ${field.label}` : draft ? `New ${type.label.toLowerCase()} field` : 'New field'}
      description={editing ? `${type.label} · ${field.key}` : draft ? type.stored : 'Choose what kind of information this field holds.'}
      footer={draft ? (
        <div className="flex items-center justify-between gap-2">
          {!editing ? <Button variant="ghost" onClick={() => setDraft(null)}><Icon name="chevron-left" />Change type</Button> : <span />}
          <div className="flex gap-2"><Button variant="neutral" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!draft.label.trim() || !draft.key.trim()} onClick={() => save.mutate()}>{editing ? 'Save changes' : 'Create field'}</Button></div>
        </div>
      ) : null}>
      {body}
    </Sheet>
  );
}
