import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { SETUP_LIST } from '@app/shared';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { setupApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Badge, hueOf } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { PaginationBar } from '../../components/ui/PaginationBar.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { DropdownMenuLabel } from '../../components/ui/DropdownMenu.jsx';
import { MenuChoice, RoundMenu } from '../../components/ui/RoundMenu.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
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

// Rows that open their own details page instead of an edit dialog.
const DETAIL_PAGES = { users: (row) => `/app/setup/users/${row.id}` };

const dash = <span className="text-muted">—</span>;
const PERSON = /(^|_)(created_by|modified_by|updated_by|owner|assigned_to|user|monitored_user|manager|requester)$/i;
const DESCRIPTION = /^(description|summary|api_name|name_api|label)$/i;

/** Rich, coloured cells (Untitled UI tables are never plain text): two-line names, dotted status badges, hue tags, avatars. */
const ROLE_HUE = { Owner: 'purple', Admin: 'indigo', Member: 'blue', Viewer: 'teal' };
const renderCell = (type, { key, first, subKey, people, pageKey }) => (row) => {
  const v = row[key];
  const empty = v === undefined || v === null || v === '';
  if (first) {
    if (empty) return dash;
    const sub = subKey ? row[subKey] : null;
    return (
      <span className="flex min-w-0 items-center gap-3">
        {people && <Avatar name={String(v)} size="size-9" />}
        <span className="min-w-0"><span className="block truncate font-medium text-ink">{String(v)}</span>{sub ? <span className="block truncate text-xs text-muted">{String(sub)}</span> : null}</span>
      </span>
    );
  }
  if (pageKey === 'users' && !empty) { // people: role, profile and state as colour tags that follow the theme
    if (key === 'role') return <Badge hue={ROLE_HUE[v] ?? hueOf(v)}>{String(v)}</Badge>;
    if (key === 'profile') return <Badge hue={hueOf(v)}>{String(v)}</Badge>;
  }
  if (pageKey === 'users' && key === 'active') return row.active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="warning" dot>Invited</Badge>;
  if (type === 'check' || v === true || v === false || v === 'true' || v === 'false') {
    const on = v === true || v === 'true';
    if (empty && type !== 'check') return dash;
    return on ? <Badge tone="success" dot>Yes</Badge> : <Badge tone="neutral" dot>No</Badge>;
  }
  if (empty) return dash;
  if (type === 'datetime') return <span className="text-muted">{formatDateTime(v)}</span>;
  if (type === 'status') return <Badge tone={tone(String(v))} dot>{String(v)}</Badge>;
  if (type === 'select') return <Badge hue={hueOf(v)}>{String(v)}</Badge>;
  if (PERSON.test(key)) return <span className="flex items-center gap-2"><Avatar name={String(v)} size="size-7" /><span className="truncate font-medium text-ink">{String(v)}</span></span>;
  if (type === 'link') return <span className="font-medium text-link">{String(v)}</span>;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v)) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(String(v))) return <span className="text-muted">{String(v)}</span>;
  return <span className="text-muted">{String(v)}</span>;
};

/**
 * Generic list template for every record-backed Setup page (and platform tables such as sessions or login history).
 * Server-side search, view filter, keyset "Load more", capped total, create/edit dialog, single and bulk delete.
 * `embedded` renders its actions in a toolbar instead of the page header (several lists on one page).
 */
function ListBody({ pageKey, definition, embedded, parentId, createDefaults, onOpen }) {
  const { page, adapter, views } = definition;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('q') ?? ''); // global search deep link
  const viewOptions = (views ?? []).map((v) => (typeof v === 'string' ? { value: v, label: v } : v)); // definitions list views as plain strings
  const [view, setView] = useState(viewOptions[0]?.value ?? '');
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // { mode: 'create' | 'edit', record? }
  const [confirm, setConfirm] = useState(false);
  const q = useDebouncedValue(search.trim());

  const readOnly = adapter ? adapter.readOnly : page.readOnly;
  const canCreate = !readOnly && (adapter ? adapter.canCreate : Boolean(page.newLabel));
  const canEdit = !readOnly && (adapter ? adapter.canEdit : true);
  const canDelete = !readOnly && (adapter ? adapter.canDelete : true);
  const searchable = adapter?.searchable !== false;

  // Sorting is done by the server (keyset paging keeps working); adapter-backed pages have their own fixed order. Click: asc → desc → default.
  const [sort, setSort] = useState(null);
  const onSort = (key) => setSort((cur) => (cur?.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null));

  // Cursor paging with Previous / Next: the cursors of the pages already visited are kept, so "Previous" is a cache hit.
  // Any change to search / filter / sort / page size starts again from the first page.
  const [pageSize, setPageSize] = useState(25);
  const sig = JSON.stringify([pageKey, q, view, parentId, sort?.key, sort?.dir, pageSize]);
  const [pager, setPager] = useState({ sig, cursors: [undefined] });
  const cursors = pager.sig === sig ? pager.cursors : [undefined];
  const index = cursors.length - 1;
  const records = useQuery({
    queryKey: ['setup', 'records', pageKey, { q, view, parentId, sort: sort?.key, dir: sort?.dir, size: pageSize, after: cursors[index] }],
    queryFn: () => setupApi.records(pageKey, { limit: pageSize, after: cursors[index], q, view, parent: parentId, sort: sort?.key, dir: sort?.dir, total: !cursors[index] }),
    placeholderData: keepPreviousData,
  });
  const [knownTotal, setKnownTotal] = useState({ sig, n: undefined, capped: false });
  const data = records.data;
  if (data && index === 0 && data.total !== undefined && (knownTotal.sig !== sig || knownTotal.n !== data.total)) setKnownTotal({ sig, n: data.total, capped: Boolean(data.totalCapped) });
  const nextCursor = data?.nextCursor ?? null;
  const goNext = () => nextCursor && setPager({ sig, cursors: [...cursors, nextCursor] });
  const goPrev = () => index > 0 && setPager({ sig, cursors: cursors.slice(0, -1) });

  const rows = useMemo(() => data?.items ?? [], [data]);
  // The Users list shows the exact, uncapped member count (several conditions can be added to this query) when add-ons are on.
  const { me } = useAuth();
  const exactUsers = useQuery({ queryKey: ['setup', 'users', 'count', { q }], queryFn: () => setupApi.userCount({ q }), enabled: pageKey === 'users' && Boolean(me?.features?.accessAddons), placeholderData: keepPreviousData });
  const totalKnown = exactUsers.data ? { n: exactUsers.data.count, capped: false } : knownTotal.sig === sig ? knownTotal : { n: undefined, capped: false };
  const total = totalKnown.n === undefined ? undefined : `${totalKnown.n.toLocaleString()}${totalKnown.capped ? '+' : ''}`;

  const columns = useMemo(() => {
    const people = pageKey === 'users'; // name + email under it with an avatar; username / alias / email columns would only repeat it
    const subKey = people ? 'email' : page.columns.slice(1).find((c) => DESCRIPTION.test(c.key))?.key;
    const firstType = adapter?.columnTypes?.[page.columns[0]?.key] ?? page.columns[0]?.type;
    const richFirst = firstType === 'text' || firstType === 'link' || firstType === undefined;
    return page.columns.filter((c) => !(richFirst && subKey && c.key === subKey) && !(people && (c.key === 'alias' || c.key === 'username'))).map((c) => {
      const i = page.columns.indexOf(c);
      const type = adapter?.columnTypes?.[c.key] ?? c.type;
      const first = i === 0 && (type === 'text' || type === 'link' || type === undefined);
      return { key: c.key, label: c.label, sortable: !adapter, width: first ? 300 : people ? (c.key === 'profile' ? 200 : 140) : undefined, align: c.type === 'number' ? 'right' : undefined, render: renderCell(type, { key: c.key, first, subKey: first ? subKey : undefined, people: first && people, pageKey }) };
    });
  }, [page.columns, adapter, pageKey]);

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
        {viewOptions.length > 1 && (
          <RoundMenu icon="filter" label="List view" size="md" align="start" active={view !== viewOptions[0].value}>
            <DropdownMenuLabel>List view</DropdownMenuLabel>
            {viewOptions.map((v) => <MenuChoice key={v.value} selected={v.value === view} onSelect={() => setView(v.value)}>{v.label}</MenuChoice>)}
          </RoundMenu>
        )}
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
            sort={sort}
            onSort={adapter ? undefined : onSort}
            storageKey={`setup:${pageKey}`}
            loading={records.isFetching && !rows.length}
            selection={canDelete ? { selected, onToggle: toggle, onToggleAll: toggleAll } : undefined}
            onRowClick={onOpen ?? (DETAIL_PAGES[pageKey] ? (record) => navigate(DETAIL_PAGES[pageKey](record)) : canEdit ? (record) => setDialog({ mode: 'edit', record }) : undefined)}
            empty={q ? `Nothing matches “${q}”` : `No ${page.name.toLowerCase()} yet`}
            footer={(
              <PaginationBar
                from={index * pageSize + 1} to={index * pageSize + rows.length} total={totalKnown.n} capped={totalKnown.capped}
                hasPrev={index > 0} hasNext={Boolean(nextCursor)} onPrev={goPrev} onNext={goNext} busy={records.isFetching}
                pageSize={pageSize} pageSizes={[10, 25, 50, 100]} onPageSize={setPageSize}
              />
            )}
          />
        )}
      </QueryState>

      {records.isFetching && rows.length > 0 && <span className="sr-only" role="status">Updating</span>}

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
