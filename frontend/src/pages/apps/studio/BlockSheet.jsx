import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { appsApi, objectsApi } from '../../../api/endpoints.js';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Sheet } from '../../../components/ui/Sheet.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { SwitchGroup } from '../../../components/ui/SwitchGroup.jsx';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { ErrorBox } from '../../setup/objects/shared.jsx';
import { useStudio } from '../useApps.js';

const move = (list, i, d) => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; };

function Setting({ d, value, onChange, fields }) {
  switch (d.kind) {
    case 'int': return <Input label={d.label} inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'bool': return <Switch label={d.label} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case 'enum': return <Select label={d.label} options={d.options} value={value ?? d.default} onChange={onChange} />;
    case 'text': return <Textarea label={d.label} rows={8} className="font-mono text-xs" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'fieldKey': return <Select label={d.label} placeholder="None" options={fields.map((f) => ({ value: f.key, label: f.label }))} value={value ?? ''} onChange={(v) => onChange(v || null)} />;
    default: return <Input label={d.label} maxLength={d.max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Everything about one block: general options, its kind's settings, the fields it shows and its buttons — all generated from the server's registry. */
export function BlockSheet({ block, meta, onClose }) {
  const { run } = useStudio();
  const kind = meta.blockKinds.find((k) => k.id === block.kind);
  const object = useQuery({ queryKey: ['object', block.object?.id], queryFn: () => objectsApi.get(block.object.id), enabled: Boolean(block.object), staleTime: 30_000 });
  const objects = useQuery({ queryKey: ['objects', 'for-blocks'], queryFn: () => objectsApi.list({ limit: 200 }), staleTime: 30_000, enabled: kind.needsObject });
  const [tab, setTab] = useState('general');
  const [general, setGeneral] = useState({ title: block.title, showTitle: block.showTitle, heightPx: block.heightPx, objectId: block.object?.id ?? null });
  const [settings, setSettings] = useState(block.settings);
  const [shown, setShown] = useState(block.fields.map((f) => f.fieldKey));
  const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const fields = object.data?.fields.filter((f) => f.active) ?? [];
  const send = async (fn) => { setBusy(true); setError(null); try { await run(fn); } catch (e) { setError(e); throw e; } finally { setBusy(false); } };
  const saveMain = async () => {
    await send(async () => {
      await appsApi.updateBlock(block.id, { title: general.title, showTitle: general.showTitle, heightPx: general.heightPx ?? null, ...(general.objectId !== (block.object?.id ?? null) ? { objectId: general.objectId } : {}), settings: Object.fromEntries(kind.settings.map((d) => [d.key, settings[d.key]]).filter(([, v]) => v !== undefined)) });
      if (kind.fields && (general.objectId ?? null) === (block.object?.id ?? null)) await appsApi.setFields(block.id, shown.map((fieldKey) => ({ fieldKey })));
    }).then(onClose).catch(() => {});
  };
  const tabs = [{ id: 'general', label: 'General' }, ...(kind.settings.length ? [{ id: 'settings', label: 'Settings' }] : []), ...(kind.fields ? [{ id: 'fields', label: kind.fields === 'columns' ? 'Columns' : 'Fields' }] : []), { id: 'buttons', label: `Buttons (${block.actions.block.length + block.actions.row.length})` }];
  return (
    <Sheet open onClose={onClose} width="w-[34rem]" icon={kind.icon} title={`${kind.label} settings`} description={block.object ? `${block.object.label} · ${kind.description}` : kind.description}
      footer={<div className="flex justify-end gap-2"><Button variant="neutral" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={saveMain}>Save changes</Button></div>}>
      <div className="space-y-5">
        <ErrorBox error={error} />
        <Tabs label="Block sections" value={tab} onChange={setTab} tabs={tabs} />
        {tab === 'general' && (
          <div className="space-y-5">
            <Input label="Title" value={general.title} onChange={(e) => setGeneral((g) => ({ ...g, title: e.target.value }))} />
            <Switch label="Show the title" checked={general.showTitle} onChange={(e) => setGeneral((g) => ({ ...g, showTitle: e.target.checked }))} />
            <Input label="Height (px)" hint="Leave empty to fit the content." inputMode="numeric" value={general.heightPx ?? ''} onChange={(e) => setGeneral((g) => ({ ...g, heightPx: e.target.value === '' ? null : Number(e.target.value) }))} />
            {kind.needsObject && <Select label="Object" options={(objects.data?.items ?? []).map((o) => ({ value: o.id, label: o.label }))} value={general.objectId ?? ''} onChange={(v) => setGeneral((g) => ({ ...g, objectId: v }))} hint="Changing the object resets the fields." />}
          </div>
        )}
        {tab === 'settings' && <div className="space-y-5">{kind.settings.map((d) => <Setting key={d.key} d={d} fields={fields} value={settings[d.key]} onChange={(v) => setSettings((s) => ({ ...s, [d.key]: v }))} />)}</div>}
        {tab === 'fields' && (
          <div className="space-y-4">
            <SwitchGroup label={kind.fields === 'columns' ? 'Show these columns' : 'Show these fields'} value={shown} options={fields.map((f) => ({ value: f.key, label: f.label, description: f.key }))} onChange={(next) => setShown((cur) => [...cur.filter((k) => next.includes(k)), ...next.filter((k) => !cur.includes(k))])} />
            {shown.length > 1 && (
              <div className="space-y-1.5"><p className="text-sm font-medium text-ink">Order</p>
                {shown.map((k, i) => <div key={k} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"><span className="min-w-0 flex-1 truncate">{fields.find((f) => f.key === k)?.label ?? k}</span><Button size="icon" variant="ghost" aria-label={`Move ${k} up`} disabled={i === 0} onClick={() => setShown(move(shown, i, -1))}><Icon name="chevron-up" className="size-4" /></Button><Button size="icon" variant="ghost" aria-label={`Move ${k} down`} disabled={i === shown.length - 1} onClick={() => setShown(move(shown, i, 1))}><Icon name="chevron-down" className="size-4" /></Button></div>)}
              </div>
            )}
          </div>
        )}
        {tab === 'buttons' && <ButtonsEditor block={block} kind={kind} meta={meta} send={send} />}
      </div>
    </Sheet>
  );
}

/** The block's buttons, grouped by where they appear. Saved immediately; what they do comes later. */
function ButtonsEditor({ block, kind, meta, send }) {
  const [adding, setAdding] = useState(null);
  return (
    <div className="space-y-6">
      {['block', 'row'].filter((scope) => kind.actions[scope].length).map((scope) => {
        const list = block.actions[scope];
        return (
          <section key={scope} className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">{scope === 'block' ? 'Toolbar' : 'On each row'}</h3>
            {list.length === 0 && <p className="text-sm text-muted">No buttons.</p>}
            {list.map((a, i) => (
              <div key={a.id} className="space-y-2 rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Icon name={a.icon || 'zap'} className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{a.label}</span><Badge>{a.kind}</Badge>
                  <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => send(() => appsApi.orderActions(block.id, scope, move(list, i, -1).map((x) => x.id)))}><Icon name="chevron-up" className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === list.length - 1} onClick={() => send(() => appsApi.orderActions(block.id, scope, move(list, i, 1).map((x) => x.id)))}><Icon name="chevron-down" className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Remove button" onClick={() => send(() => appsApi.deleteAction(a.id))}><Icon name="trash" className="size-4" /></Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input aria-label="Label" defaultValue={a.label} onBlur={(e) => e.target.value.trim() && e.target.value !== a.label && send(() => appsApi.updateAction(a.id, { label: e.target.value.trim() }))} />
                  <Select aria-label="Style" options={meta.actionStyles} value={a.style} onChange={(style) => send(() => appsApi.updateAction(a.id, { style }))} />
                  <Select aria-label="Opens" options={meta.openModes} value={a.openMode} onChange={(openMode) => send(() => appsApi.updateAction(a.id, { openMode }))} />
                </div>
                <Switch label="Hidden" checked={a.hidden} onChange={(e) => send(() => appsApi.updateAction(a.id, { hidden: e.target.checked }))} />
              </div>
            ))}
            <Select aria-label={`Add a ${scope} button`} placeholder="Add a button…" options={kind.actions[scope].map((id) => ({ value: id, label: meta.actionKinds.find((x) => x.id === id).label }))} value={adding ?? ''} onChange={(id) => { setAdding(null); if (id) send(() => appsApi.addAction(block.id, { scope, kind: id })); }} />
          </section>
        );
      })}
    </div>
  );
}
