import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { SETUP_LIST } from '@app/shared';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { setupApi } from '../../api/endpoints.js';
import { cursorPagination } from '../../api/queries.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { formatDateTime } from '../../lib/format.js';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { QueryState } from './QueryState.jsx';
import { LoginAsButton } from './LoginAsButton.jsx';
import { SetupRecordDialog } from './SetupRecordDialog.jsx';
import { invalidateSetupData } from './invalidate.js';
import { useSetupPage } from './useSetupPage.js';

const GOOD = /^(active|success|enabled|deployed|ready|standard|yes|approved|complete)/i;
const WARN = /^(inactive|pending|draft|disabled|expired|no)/i;
const BAD = /(fatal|fail|error|invalid|denied|locked)/i;
const tone = (v) => (BAD.test(v) ? 'danger' : GOOD.test(v) ? 'success' : WARN.test(v) ? 'warning' : 'neutral');

const dash = <span className="text-muted">—</span>;
const renderCell = (type) => (row, key) => {
  const v = row[key];
  if (type === 'check') return v ? <Icon name="check" className="size-4 text-success" /> : dash;
  if (v === undefined || v === null || v === '') return dash;
  if (type === 'datetime') return formatDateTime(v);
  if (type === 'status') return <Badge tone={tone(String(v))}>{String(v)}</Badge>;
  if (type === 'link') return <span className="font-medium">{String(v)}</span>;
  return String(v);
};

/**
 * Generic list template for every record-backed Setup page (and platform tables such as sessions or login history).
 * Server-side search, view filter, keyset "Load more", capped total, create/edit dialog, single and bulk delete.
 * `embedded` renders its actions in a toolbar instead of the page header (several lists on one page).
 */
function ListBody({ pageKey, definition, embedded, parentId, createDefaults, onOpen }) {
  const { page, adapter, views } = definition;
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('q') ?? ''); // global search deep link
  const [view, setView] = useState(views?.[0] ?? '');
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // { mode: 'create' | 'edit', record? }
  const [confirm, setConfirm] = useState(false);
  const q = useDebouncedValue(search.trim());

  const readOnly = adapter ? adapter.readOnly : page.readOnly;
  const canCreate = !readOnly && (adapter ? adapter.canCreate : Boolean(page.newLabel));
  const canEdit = !readOnly && (adapter ? adapter.canEdit : true);
  const canDelete = !readOnly && (adapter ? adapter.canDelete : true);
  const searchable = adapter?.searchable !== false;

  const records = useInfiniteQuery({
    queryKey: ['setup', 'records', pageKey, { q, view, parentId }],
    queryFn: ({ pageParam }) => setupApi.records(pageKey, { after: pageParam, q, view, parent: parentId, total: !pageParam }),
    ...cursorPagination,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => records.data?.pages.flatMap((p) => p.items) ?? [], [records.data]);
  const first = records.data?.pages[0];
  const total = first?.totalCapped ? `${SETUP_LIST.countCap.toLocaleString()}+` : first?.total?.toLocaleString();

  const columns = useMemo(() => page.columns.map((c) => {
    const type = adapter?.columnTypes?.[c.key] ?? c.type;
    const render = renderCell(type);
    return { key: c.key, label: c.label, align: c.type === 'number' ? 'right' : undefined, render: (row) => render(row, c.key) };
  }), [page.columns, adapter]);

  const refresh = () => invalidateSetupData(queryClient);
  const remove = async () => { await setupApi.deleteRecords(pageKey, [...selected]); setSelected(new Set()); await refresh(); };
  const toggle = (id) => setSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = (checked) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());

  const label = adapter?.createLabel ?? page.newLabel;
  const deleteLabel = adapter?.deleteLabel ?? 'Delete';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchable && <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder={`Search ${page.name.toLowerCase()}`} label={`Search ${page.name}`} className="w-full sm:w-72" />}
        {views?.length > 1 && <Select aria-label="List view" value={view} onChange={setView} options={views} size="sm" />}
        {embedded && canCreate === false && total !== undefined && <span className="text-sm text-muted">{total} items</span>}
        {!embedded && total !== undefined && <span className="text-sm text-muted">{total} {total === '1' ? 'item' : 'items'}</span>}
        {selected.size > 0 && canDelete && <Button size="sm" variant="neutral" className="ml-auto" onClick={() => setConfirm(true)}><Icon name="trash" className="size-4" />{deleteLabel} ({selected.size})</Button>}
        {canCreate && <Button size="sm" className={selected.size > 0 && canDelete ? '' : 'ml-auto'} onClick={() => setDialog({ mode: 'create' })}><Icon name="plus" className="size-4" />{label}</Button>}
      </div>

      <QueryState query={records}>
        {() => (
          <DataTable
            columns={columns}
            rows={rows}
            loading={records.isFetching && !records.isFetchingNextPage && !rows.length}
            selection={canDelete ? { selected, onToggle: toggle, onToggleAll: toggleAll } : undefined}
            onRowClick={onOpen ?? (canEdit ? (record) => setDialog({ mode: 'edit', record }) : undefined)}
            empty={q ? `Nothing matches “${q}”` : `No ${page.name.toLowerCase()} yet`}
            footer={records.hasNextPage ? (
              <div className="flex justify-center"><Button size="sm" variant="ghost" loading={records.isFetchingNextPage} onClick={() => records.fetchNextPage()}>Load more</Button></div>
            ) : rows.length ? <p className="text-center text-xs text-muted">{rows.length.toLocaleString()} shown</p> : null}
          />
        )}
      </QueryState>

      {records.isFetching && !records.isFetchingNextPage && rows.length > 0 && <span className="sr-only" role="status">Updating</span>}

      {dialog && (
        <SetupRecordDialog
          pageKey={pageKey} collection={page} extra={adapter?.loginAs && dialog.mode === 'edit' ? <LoginAsButton userId={dialog.record.id} /> : null} mode={dialog.mode} record={dialog.record} defaults={createDefaults} parentId={parentId}
          title={dialog.mode === 'create' ? (label ?? `New ${page.name}`) : `Edit ${page.name}`} onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} danger confirmLabel={deleteLabel}
        title={`${deleteLabel} ${selected.size} selected?`} description={adapter?.deleteLabel ? undefined : 'This cannot be undone.'}
      />
    </div>
  );
}

export default function SetupListPage({ pageKey, embedded = false, parentId, createDefaults, onOpen }) {
  const query = useSetupPage(pageKey);
  return (
    <QueryState query={query}>
      {(definition) => (definition.page.columns
        ? <ListBody pageKey={pageKey} definition={definition} embedded={embedded} parentId={parentId} createDefaults={createDefaults} onOpen={onOpen} />
        : <Alert tone="warning">This page is not a list.</Alert>)}
    </QueryState>
  );
}
