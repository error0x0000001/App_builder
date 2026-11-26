import { Badge } from '../../../components/ui/Badge.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { ActionBar } from '../ActionBar.jsx';
import { Cell } from '../cells.jsx';
import { useBlockData } from '../useApps.js';
import { BlockFrame, SampleNote } from './BlockFrame.jsx';

const HUE = { red: { tone: 'danger' }, green: { tone: 'success' }, amber: { tone: 'warning' }, brand: { tone: 'accent' } };

export default function KanbanBlock({ block, onSettings }) {
  const data = useBlockData(block.id, {});
  if (!block.object) return <BlockFrame block={block} onSettings={onSettings}><p className="text-sm text-muted">Choose an object for this board in its settings.</p></BlockFrame>;
  return (
    <BlockFrame block={block} onSettings={onSettings}>
      {data.isPending ? <div className="grid place-items-center py-8"><Spinner /></div> : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {data.data.columns.map((col) => (
            <div key={col.value} className="w-64 shrink-0 space-y-2 rounded-xl bg-surface-2 p-2.5">
              <div className="flex items-center justify-between px-1"><Badge {...(HUE[col.color] ?? { tone: 'neutral' })}>{col.label}</Badge><span className="text-xs text-muted">{col.cards.length}</span></div>
              {col.cards.map((card) => (
                <div key={card.id} className="space-y-1.5 rounded-lg border border-line bg-surface p-3">
                  <p className="truncate text-sm font-semibold text-ink">{card.title}</p>
                  {card.fields.map((f, i) => <p key={i} className="flex justify-between gap-2 text-xs"><span className="text-muted">{f.label}</span><span className="min-w-0 text-ink"><Cell type={f.type} value={f.value} /></span></p>)}
                  <ActionBar actions={block.actions.row} className="flex flex-wrap gap-1" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <SampleNote sample={data.data?.sample} />
    </BlockFrame>
  );
}
