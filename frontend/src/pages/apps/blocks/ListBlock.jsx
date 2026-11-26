import { useState } from 'react';
import { Card } from '../../../components/ui/Card.jsx';
import { PaginationBar } from '../../../components/ui/PaginationBar.jsx';
import { SearchInput } from '../../../components/ui/SearchInput.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js';
import { ActionBar } from '../ActionBar.jsx';
import { Cell } from '../cells.jsx';
import { useBlockData } from '../useApps.js';
import { BlockFrame, SampleNote } from './BlockFrame.jsx';

const COLS = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };

export default function ListBlock({ block, onSettings }) {
  const s = block.settings; const [q, setQ] = useState(''); const [page, setPage] = useState(1); const dq = useDebouncedValue(q);
  const data = useBlockData(block.id, { page, pageSize: s.pageSize, q: dq || undefined });
  const cards = data.data?.cards ?? []; const from = (page - 1) * s.pageSize + 1; const total = data.data?.total ?? 0;
  if (!block.object) return <BlockFrame block={block} onSettings={onSettings}><p className="text-sm text-muted">Choose an object for this list in its settings.</p></BlockFrame>;
  return (
    <BlockFrame block={block} onSettings={onSettings} toolbar={<SearchInput className="w-48" label="Search" placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} onClear={() => setQ('')} />}>
      {data.isPending ? <div className="grid place-items-center py-8"><Spinner /></div> : (
        <div className={`grid gap-3 ${COLS[s.columns] ?? COLS[3]}`}>
          {cards.map((card) => (
            <Card key={card.id} className="space-y-2 p-4">
              <p className="truncate text-sm font-semibold text-ink">{String(card.title ?? '')}</p>
              <dl className="space-y-1 text-sm">{card.fields.map((f) => <div key={f.key} className="flex items-center justify-between gap-3"><dt className="text-muted">{f.label}</dt><dd className="min-w-0 text-right text-ink"><Cell type={f.type} value={f.value} /></dd></div>)}</dl>
              <ActionBar actions={block.actions.row} className="flex flex-wrap gap-1 pt-1" />
            </Card>
          ))}
        </div>
      )}
      <div className="pt-3"><PaginationBar from={from} to={from + cards.length - 1} total={total} hasPrev={page > 1} hasNext={from + cards.length - 1 < total} busy={data.isFetching} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} /></div>
      <SampleNote sample={data.data?.sample} />
    </BlockFrame>
  );
}
