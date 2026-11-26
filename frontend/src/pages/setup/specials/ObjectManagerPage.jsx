import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { objectsApi } from '../../../api/endpoints.js';
import { ObjectForm } from '../../../components/fields/ObjectForm.jsx';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { FeaturedIcon } from '../../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { MenuChoice, RoundMenu } from '../../../components/ui/RoundMenu.jsx';
import { SearchInput } from '../../../components/ui/SearchInput.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import { PageToolbar } from '../../../layouts/PageToolbar.jsx';
import { formatRelative } from '../../../lib/format.js';
import { FieldSheet } from '../objects/FieldSheet.jsx';
import { ObjectSheet } from '../objects/ObjectSheet.jsx';
import { ErrorBox, useObjectsMeta } from '../objects/shared.jsx';

const COLOR = { gray: 'gray', brand: 'brand', blue: 'blue', green: 'success', amber: 'warning', red: 'error', purple: 'purple', pink: 'pink', teal: 'teal', indigo: 'indigo' };
const useDebounced = (value, ms = 250) => { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]); return v; };
const toggleDir = (cur, key, order) => (cur === key ? (order === 'asc' ? 'desc' : 'asc') : 'asc');

// ------------------------------------------------------------------------------------------------------------- objects list

function ObjectsList({ meta, onOpen }) {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const debounced = useDebounced(q);
  const kind = params.get('kind') ?? 'all'; const archived = params.get('archived') ?? 'false'; const sort = params.get('sort') ?? 'label'; const order = params.get('order') ?? 'asc';
  const patch = (obj) => setParams((p) => { const n = new URLSearchParams(p); Object.entries(obj).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return n; }, { replace: true });
  const list = useQuery({ queryKey: ['objects', { q: debounced, kind, archived, sort, order }], queryFn: () => objectsApi.list({ q: debounced, kind, archived, sort, order }), placeholderData: keepPreviousData });
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <PageToolbar meta={list.data ? `${list.data.total} ${list.data.total === 1 ? 'object' : 'objects'}` : undefined}>
        <SearchInput className="w-56" label="Search objects" placeholder="Search objects" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} />
        <RoundMenu icon="filter" label="Filter objects" active={kind !== 'all' || archived === 'true'}>
          {[['all', 'All objects'], ['custom', 'Custom only'], ['standard', 'Standard only']].map(([v, l]) => <MenuChoice key={v} selected={kind === v} onSelect={() => patch({ kind: v === 'all' ? '' : v })}>{l}</MenuChoice>)}
          <MenuChoice selected={archived === 'true'} onSelect={() => patch({ archived: archived === 'true' ? '' : 'true' })}>Show archived</MenuChoice>
        </RoundMenu>
        <RoundMenu icon="sort" label="Sort objects" active={sort !== 'label' || order !== 'asc'}>
          {[['label', 'Name'], ['key', 'API name'], ['fields', 'Number of fields'], ['updated', 'Last changed']].map(([v, l]) => <MenuChoice key={v} selected={sort === v} onSelect={() => patch({ sort: v === 'label' ? '' : v })}>{l}</MenuChoice>)}
          <MenuChoice selected={order === 'desc'} onSelect={() => patch({ order: order === 'desc' ? '' : 'desc' })}>Descending</MenuChoice>
        </RoundMenu>
        <Button shape="round" size="icon" aria-label="New object" onClick={() => setCreating(true)}><Icon name="plus" className="size-4" /></Button>
      </PageToolbar>
      {list.isError && <ErrorBox error={list.error} />}
      <DataTable
        rows={list.data?.items ?? []} loading={list.isPending} storageKey="objects" empty="No objects match." onRowClick={(o) => onOpen(o.id)} sort={{ key: sort, dir: order }}
        onSort={(key) => patch({ sort: key === 'label' ? '' : key, order: toggleDir(sort, key, order) === 'desc' ? 'desc' : '' })}
        columns={[
          { key: 'label', label: 'Object', sortable: true, width: 260, render: (o) => <span className="flex items-center gap-3"><FeaturedIcon icon={o.icon} color={COLOR[o.color] ?? 'brand'} size="sm" shape="square" /><span className="min-w-0"><span className="block truncate font-semibold text-ink">{o.label}</span><span className="block truncate text-xs text-muted">{o.description || o.pluralLabel}</span></span></span> },
          { key: 'key', label: 'API name', sortable: true, width: 160, render: (o) => <code className="text-xs">{o.key}</code> },
          { key: 'kind', label: 'Type', width: 110, render: (o) => <Badge tone={o.kind === 'standard' ? 'neutral' : 'accent'}>{o.kind === 'standard' ? 'Standard' : 'Custom'}</Badge> },
          { key: 'scope', label: 'Records', width: 140, render: (o) => <Badge hue={o.workspaceScope === 'tenant' ? 'teal' : 'blue'}>{o.workspaceScope === 'tenant' ? 'Shared' : 'Per workspace'}</Badge> },
          { key: 'fields', label: 'Fields', sortable: true, width: 90, align: 'right', render: (o) => o.fieldCount },
          { key: 'updated', label: 'Changed', sortable: true, width: 130, render: (o) => formatRelative(o.updatedAt) },
        ]}
      />
      {creating && <ObjectSheet open meta={meta} onClose={() => setCreating(false)} onSaved={(o) => onOpen(o.id)} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- one object

const flagBadges = (f) => [f.required && ['Required', 'warning'], f.unique && ['Unique', 'neutral'], f.encrypted && ['Encrypted', 'accent'], f.indexed && ['Indexed', 'neutral'], f.readOnly && ['Read-only', 'neutral'], !f.active && ['Inactive', 'neutral']].filter(Boolean);

function FieldsTab({ object, meta, allFields }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const [group, setGroup] = useState(''); const [flag, setFlag] = useState(''); const [sort, setSort] = useState('order'); const [order, setOrder] = useState('asc');
  const params = { q: debounced, group: group || undefined, flag: flag || undefined, sort, order };
  const list = useQuery({ queryKey: ['fields', object.id, params], queryFn: () => objectsApi.fields(object.id, params), placeholderData: keepPreviousData });
  const [sheet, setSheet] = useState(null);
  const [removing, setRemoving] = useState(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['object', object.id] }), queryClient.invalidateQueries({ queryKey: ['fields', object.id] }), queryClient.invalidateQueries({ queryKey: ['objects'] })]);
  const reorder = useMutation({ mutationFn: (ids) => objectsApi.order(object.id, ids), onSettled: refresh });
  const remove = useMutation({ mutationFn: (f) => objectsApi.deleteField(object.id, f.id), onSuccess: () => { setRemoving(null); return refresh(); } });
  const typeOf = (id) => meta.fieldTypes.find((t) => t.id === id);
  const plain = !debounced && !group && !flag && sort === 'order' && order === 'asc';
  const move = (f, d) => { const ids = allFields.map((x) => x.id); const i = ids.indexOf(f.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; reorder.mutate(ids); };
  const groups = [...new Set(meta.fieldTypes.map((t) => t.group))];
  const columns = [
    { key: 'label', label: 'Field', sortable: true, width: 210, render: (f) => <span className="min-w-0"><span className="block truncate font-semibold text-ink">{f.label}</span><span className="block truncate font-mono text-xs text-muted">{f.key}</span></span> },
    { key: 'type', label: 'Type', sortable: true, width: 170, render: (f) => <span className="inline-flex items-center gap-2"><Icon name={typeOf(f.type)?.icon} className="size-4 text-muted" />{typeOf(f.type)?.label ?? f.type}</span> },
    { key: 'flags', label: 'Properties', width: 210, wrap: true, render: (f) => <span className="flex flex-wrap gap-1">{flagBadges(f).map(([l, tone]) => <Badge key={l} tone={tone}>{l}</Badge>)}</span> },
    { key: 'behaviour', label: 'Behaviour', width: 150, render: (f) => [f.rules.length && `${f.rules.length} rule${f.rules.length > 1 ? 's' : ''}`, f.validations.length && `${f.validations.length} validation${f.validations.length > 1 ? 's' : ''}`, f.autofill.length && 'autofill'].filter(Boolean).join(' · ') || '—' },
    { key: 'actions', label: '', width: 140, align: 'right', render: (f) => (
      <span className="flex justify-end">
        <Button size="icon" variant="ghost" aria-label={`Move ${f.label} up`} disabled={!plain || reorder.isPending || allFields[0]?.id === f.id} onClick={(e) => { e.stopPropagation(); move(f, -1); }}><Icon name="arrow-up" className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={`Move ${f.label} down`} disabled={!plain || reorder.isPending || allFields.at(-1)?.id === f.id} onClick={(e) => { e.stopPropagation(); move(f, 1); }}><Icon name="arrow-down" className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={`Delete ${f.label}`} disabled={f.system} onClick={(e) => { e.stopPropagation(); setRemoving(f); }}><Icon name="trash" className="size-4" /></Button>
      </span>
    ) },
  ];
  return (
    <div className="space-y-4">
      <PageToolbar meta={list.data ? `${list.data.total} ${list.data.total === 1 ? 'field' : 'fields'}` : undefined}>
        <SearchInput className="w-56" label="Search fields" placeholder="Search fields" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} />
        <RoundMenu icon="filter" label="Filter fields" active={Boolean(group || flag)}>
          <MenuChoice selected={!group} onSelect={() => setGroup('')}>All kinds</MenuChoice>
          {groups.map((g) => <MenuChoice key={g} selected={group === g} onSelect={() => setGroup(g)}>{g}</MenuChoice>)}
          {[['required', 'Required'], ['unique', 'Unique'], ['encrypted', 'Encrypted'], ['indexed', 'Indexed'], ['computed', 'Calculated']].map(([v, l]) => <MenuChoice key={v} selected={flag === v} onSelect={() => setFlag(flag === v ? '' : v)}>{l} only</MenuChoice>)}
        </RoundMenu>
        <RoundMenu icon="sort" label="Sort fields" active={sort !== 'order' || order !== 'asc'}>
          {[['order', 'Layout order'], ['label', 'Name'], ['key', 'API name'], ['type', 'Type'], ['updated', 'Last changed']].map(([v, l]) => <MenuChoice key={v} selected={sort === v} onSelect={() => setSort(v)}>{l}</MenuChoice>)}
          <MenuChoice selected={order === 'desc'} onSelect={() => setOrder(order === 'desc' ? 'asc' : 'desc')}>Descending</MenuChoice>
        </RoundMenu>
        <Button shape="round" size="icon" aria-label="New field" disabled={Boolean(object.archivedAt)} onClick={() => setSheet({})}><Icon name="plus" className="size-4" /></Button>
      </PageToolbar>
      {(reorder.error || remove.error) && <ErrorBox error={reorder.error ?? remove.error} />}
      <DataTable rows={list.data?.items ?? []} loading={list.isPending} columns={columns} storageKey="fields" empty={debounced || group || flag ? 'No fields match.' : 'No fields yet. Add the first one with +.'} onRowClick={(f) => setSheet({ field: f })}
        sort={{ key: sort === 'order' ? '' : sort, dir: order }} onSort={(key) => { if (!['label', 'type'].includes(key)) return; setOrder(sort === key && order === 'asc' ? 'desc' : 'asc'); setSort(key); }} />
      {sheet && <FieldSheet key={sheet.field?.id ?? 'new'} open objectId={object.id} field={sheet.field} meta={meta} fields={allFields} onClose={() => setSheet(null)} />}
      <ConfirmDialog open={Boolean(removing)} title={`Delete ${removing?.label}?`} message="The field and its configuration are removed. Fields that depend on it block the delete." confirmLabel="Delete field" tone="danger" loading={remove.isPending} onConfirm={() => remove.mutate(removing)} onClose={() => { setRemoving(null); remove.reset(); }} />
    </div>
  );
}

function PreviewTab({ object }) {
  const [mode, setMode] = useState('create'); const [role, setRole] = useState('');
  return (
    <div className="space-y-4">
      <PageToolbar meta="The form as people will see it. Every field is resolved by the server as you type.">
        <RoundMenu icon="edit" label="Mode" active={mode !== 'create'}>
          <MenuChoice selected={mode === 'create'} onSelect={() => setMode('create')}>Creating a record</MenuChoice>
          <MenuChoice selected={mode === 'edit'} onSelect={() => setMode('edit')}>Editing a record</MenuChoice>
        </RoundMenu>
        <RoundMenu icon="user" label="View as" active={Boolean(role)}>
          <MenuChoice selected={!role} onSelect={() => setRole('')}>Me</MenuChoice>
          {['owner', 'admin', 'member', 'viewer'].map((r) => <MenuChoice key={r} selected={role === r} onSelect={() => setRole(r)}>As {r}</MenuChoice>)}
        </RoundMenu>
      </PageToolbar>
      <Card className="max-w-2xl p-5"><ObjectForm key={`${object.id}-${mode}`} objectId={object.id} mode={mode} as={role ? { role } : undefined} /></Card>
    </div>
  );
}

function ObjectDetail({ id, meta, onBack }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['object', id], queryFn: () => objectsApi.get(id) });
  const [tab, setTab] = useState('fields');
  const [editing, setEditing] = useState(false);
  const archive = useMutation({ mutationFn: () => (detail.data.object.archivedAt ? objectsApi.restore(id) : objectsApi.archive(id)), onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['object', id] }), queryClient.invalidateQueries({ queryKey: ['objects'] })]) });
  if (detail.isPending) return <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>;
  if (detail.isError) return <div className="space-y-3"><Button variant="ghost" size="sm" onClick={onBack}><Icon name="chevron-left" />Objects</Button><ErrorBox error={detail.error} /></div>;
  const { object, fields } = detail.data;
  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}><Icon name="chevron-left" />Objects</Button>
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <FeaturedIcon icon={object.icon} color={COLOR[object.color] ?? 'brand'} size="lg" shape="square" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-ink">{object.label}</h2>
          <p className="truncate text-sm text-muted"><code className="text-xs">{object.key}</code>{object.description ? ` · ${object.description}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={object.kind === 'standard' ? 'neutral' : 'accent'}>{object.kind === 'standard' ? 'Standard' : 'Custom'}</Badge><Badge hue={object.workspaceScope === 'tenant' ? 'teal' : 'blue'}>{object.workspaceScope === 'tenant' ? 'Shared across workspaces' : 'Per workspace'}</Badge>{object.deploymentStatus === 'development' && <Badge tone="warning">In development</Badge>}{object.archivedAt && <Badge tone="warning">Archived</Badge>}</div>
        </div>
        <div className="flex gap-2"><Button variant="neutral" size="sm" onClick={() => setEditing(true)}><Icon name="edit" />Edit</Button>{object.kind !== 'standard' && <Button variant="neutral" size="sm" loading={archive.isPending} onClick={() => archive.mutate()}>{object.archivedAt ? 'Restore' : 'Archive'}</Button>}</div>
      </Card>
      {archive.error && <ErrorBox error={archive.error} />}
      <Tabs label="Object sections" value={tab} onChange={setTab} tabs={[{ id: 'fields', label: `Fields (${fields.length})`, icon: 'list' }, { id: 'preview', label: 'Preview', icon: 'eye' }]} />
      {tab === 'fields' ? <FieldsTab object={object} meta={meta} allFields={fields} /> : <PreviewTab object={object} />}
      {editing && <ObjectSheet open object={object} meta={meta} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Setup › Object Manager: define objects and their fields (configuration only — nothing reads these yet). */
export default function ObjectManagerPage() {
  const [params, setParams] = useSearchParams();
  const meta = useObjectsMeta();
  const id = params.get('object');
  const open = (value) => setParams((p) => { const n = new URLSearchParams(p); if (value) n.set('object', value); else n.delete('object'); return n; });
  if (meta.isPending) return <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>;
  if (meta.isError) return <Alert tone="error">{meta.error.message}</Alert>;
  return id ? <ObjectDetail id={id} meta={meta.data} onBack={() => open(null)} /> : <ObjectsList meta={meta.data} onOpen={open} />;
}
