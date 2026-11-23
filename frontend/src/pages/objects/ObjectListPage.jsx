import { CRM_NAV_OBJECTS, hasRole, objectRecordFormSchema } from '@app/shared';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { objectsApi } from '../../api/endpoints.js';
import { cursorPagination, objectDefinitionQuery } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { PageHeaderActions, PageHeaderTitle } from '../../layouts/PageHeader.jsx';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { QueryState } from '../setup/QueryState.jsx';
import { RecordDialog } from '../setup/RecordDialog.jsx';

const APPROVAL_TONE = { Pending: 'warning', Approved: 'success', Rejected: 'danger' };
const formType = (f) => f.input;

/** Approve / reject bar shown inside the dialog of a record that is waiting on the signed-in person. */
function ApprovalBar({ object, record, onDecided }) {
  const { user, activeWorkspace } = useAuth();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const allowed = hasRole(activeWorkspace.role, 'admin') || record.approver?.toLowerCase() === user.email.toLowerCase();
  const decide = async (decision) => {
    setBusy(true); setError(null);
    try { await objectsApi.decide(object, record.id, { decision }); onDecided(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Alert tone="warning" title={`Waiting for approval (${record.approval_process})`}>
      <p className="mb-2 text-sm">Approver: {record.approver}</p>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {allowed ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide('approve')} loading={busy}><Icon name="check" className="size-4" />Approve</Button>
          <Button size="sm" variant="neutral" onClick={() => decide('reject')} disabled={busy}><Icon name="x" className="size-4" />Reject</Button>
        </div>
      ) : <p className="text-sm">Only the approver or an admin can decide.</p>}
    </Alert>
  );
}

function ObjectBody({ object, definition, permissions }) {
  const queryClient = useQueryClient();
  const { activeWorkspace } = useAuth();
  const { create: canCreate, edit: canEdit, delete: canDelete } = permissions; // per-object, from Profiles / Permission Sets / Sharing
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState(null); // { mode, record? }
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState([]);
  const q = useDebouncedValue(search.trim());

  // Global search deep link: /app/o/Lead?open=<id> opens that record (permission-checked by the API).
  const openId = params.get('open');
  useEffect(() => {
    if (!openId) return;
    objectsApi.get(object, openId).then(({ record }) => setDialog({ mode: 'edit', record })).catch(() => {}).finally(() => setParams({}, { replace: true }));
  }, [openId, object, setParams]);

  // Navigation "+" deep link: /app/o/Lead?new=1 opens the New dialog (only when this person may create).
  const wantsNew = params.get('new');
  useEffect(() => {
    if (!wantsNew) return;
    if (canCreate) setDialog({ mode: 'create' });
    setParams({}, { replace: true });
  }, [wantsNew, canCreate, setParams]);

  const records = useInfiniteQuery({
    queryKey: ['objects', 'records', object, { q }],
    queryFn: ({ pageParam }) => objectsApi.records(object, { after: pageParam, q }),
    ...cursorPagination,
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => records.data?.pages.flatMap((p) => p.items) ?? [], [records.data]);
  const formFields = useMemo(() => definition.fields.filter((f) => !f.readOnly).map((f) => ({ key: f.key, label: f.label, type: formType(f), required: f.required })), [definition]);

  const columns = useMemo(() => {
    const shown = definition.fields.filter((f) => f.input !== 'textarea').slice(0, 6).map((f) => ({
      key: f.key, label: f.label,
      render: (row) => (row[f.key] === undefined || row[f.key] === '' ? <span className="text-muted">—</span> : f.key === definition.nameKey ? <span className="font-medium">{String(row[f.key])}</span> : f.input === 'check' ? (row[f.key] ? <Icon name="check" className="size-4 text-success" /> : '—') : String(row[f.key])),
    }));
    if (rows.some((r) => r.approval_status)) shown.push({ key: 'approval_status', label: 'Approval', render: (r) => (r.approval_status ? <Badge tone={APPROVAL_TONE[r.approval_status]}>{r.approval_status}</Badge> : '—') });
    return shown;
  }, [definition, rows]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['objects', 'records', object] });
  const save = (mode, record) => async (values) => {
    const res = mode === 'edit' ? await objectsApi.update(object, record.id, values) : await objectsApi.create(object, values);
    setNotice(res.warnings ?? []);
    await refresh();
  };
  const remove = async () => { await objectsApi.remove(object, [...selected]); setSelected(new Set()); await refresh(); };
  const toggle = (id) => setSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="space-y-3">
      <PageHeaderTitle icon={CRM_NAV_OBJECTS.find((o) => o.key === definition.key)?.icon ?? 'users'}>{definition.plural}</PageHeaderTitle>
      <PageHeaderActions>
        {hasRole(activeWorkspace.role, 'admin') && <Button as={Link} to="/app/setup/object-manager" size="sm" variant="neutral"><Icon name="sliders" className="size-4" />Customize</Button>}
        {canCreate && <Button size="sm" onClick={() => setDialog({ mode: 'create' })}><Icon name="plus" className="size-4" />New {definition.key}</Button>}
      </PageHeaderActions>

      {notice.map((n) => <Alert key={n} tone="warning">{n}</Alert>)}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder={`Search ${definition.plural.toLowerCase()}`} label={`Search ${definition.plural}`} className="w-full sm:w-72" />
        {selected.size > 0 && canDelete && <Button size="sm" variant="neutral" className="ml-auto" onClick={() => setConfirm(true)}><Icon name="trash" className="size-4" />Delete ({selected.size})</Button>}
      </div>

      <QueryState query={records}>
        {() => (
          <DataTable
            columns={columns} rows={rows}
            selection={canDelete ? { selected, onToggle: toggle, onToggleAll: (c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set()) } : undefined}
            onRowClick={(record) => setDialog({ mode: 'edit', record })}
            empty={q ? `Nothing matches “${q}”` : `No ${definition.plural.toLowerCase()} yet`}
            footer={records.hasNextPage ? <div className="flex justify-center"><Button size="sm" variant="ghost" loading={records.isFetchingNextPage} onClick={() => records.fetchNextPage()}>Load more</Button></div> : rows.length ? <p className="text-center text-xs text-muted">{rows.length.toLocaleString()} shown</p> : null}
          />
        )}
      </QueryState>

      {dialog && (
        <RecordDialog
          title={dialog.mode === 'create' ? `New ${definition.key}` : `Edit ${definition.key}`}
          fields={formFields}
          schema={objectRecordFormSchema(definition.fields, dialog.mode)}
          values={dialog.record}
          onSubmit={dialog.mode === 'create' ? save('create') : canEdit ? save('edit', dialog.record) : async () => {}}
          onClose={() => setDialog(null)}
        >
          {dialog.record?.approval_status === 'Pending' && <ApprovalBar object={object} record={dialog.record} onDecided={async () => { await refresh(); setDialog(null); }} />}
          {dialog.mode === 'edit' && !canEdit && <Alert tone="info">You have read-only access to these records.</Alert>}
        </RecordDialog>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} danger confirmLabel="Delete" title={`Delete ${selected.size} selected?`} description="This cannot be undone." />
    </div>
  );
}

/** Records of any Object Manager object: columns, form and validation come from the object's definition. */
export default function ObjectListPage() {
  const { object } = useParams();
  const definition = useQuery(objectDefinitionQuery(object));
  return <QueryState query={definition}>{({ definition: def, permissions }) => <ObjectBody key={object} object={object} definition={def} permissions={permissions} />}</QueryState>;
}
