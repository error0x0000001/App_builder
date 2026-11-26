import { useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { PaginationBar } from '../../../components/ui/PaginationBar.jsx';
import { SearchInput } from '../../../components/ui/SearchInput.jsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js';
import { ActionBar } from '../ActionBar.jsx';
import { Cell } from '../cells.jsx';
import { useBlockData } from '../useApps.js';
import { BlockFrame, SampleNote } from './BlockFrame.jsx';

/** Rows come from the server already sorted, searched and paged; this only draws them. */
export default function TableBlock({ block, onSettings }) {
  const s = block.settings;
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [sort, setSort] = useState(null);
  const dq = useDebouncedValue(q);
  const data = useBlockData(block.id, { page, pageSize: s.pageSize, q: dq || undefined, sort: sort?.key, dir: sort?.dir });
  const rows = data.data?.rows ?? [];
  const from = (page - 1) * s.pageSize + 1; const total = data.data?.total ?? 0;
  const columns = [
    ...(s.rowNumbers ? [{ key: '#', label: '#', width: 64, render: (r) => from + rows.indexOf(r) }] : []),
    ...(data.data?.columns ?? []).map((c) => ({ key: c.key, label: c.label, sortable: true, width: c.width ?? 180, render: (r) => <Cell type={c.type} value={r.cells[c.key]} /> })),
    ...(block.actions.row.length ? [{ key: '__actions', label: '', width: Math.max(120, block.actions.row.length * 84), align: 'right', render: () => <ActionBar actions={block.actions.row} className="flex justify-end gap-1" /> }] : []),
  ];
  if (!block.object) return <BlockFrame block={block} onSettings={onSettings}><p className="text-sm text-muted">Choose an object for this table in its settings.</p></BlockFrame>;
  return (
    <BlockFrame block={block} onSettings={onSettings} toolbar={<SearchInput className="w-48" label="Search" placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} onClear={() => setQ('')} />}>
      <DataTable rows={rows} columns={columns} loading={data.isPending} density={s.density} striped={s.striped} empty="No records match." sort={sort ?? undefined}
        onSort={(key) => { setSort((cur) => (cur?.key === key ? (cur.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' })); setPage(1); }}
        footer={<PaginationBar from={from} to={from + rows.length - 1} total={total} hasPrev={page > 1} hasNext={from + rows.length - 1 < total} busy={data.isFetching} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />} />
      <SampleNote sample={data.data?.sample} />
    </BlockFrame>
  );
}
