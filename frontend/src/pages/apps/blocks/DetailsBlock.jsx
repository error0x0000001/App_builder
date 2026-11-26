import { Spinner } from '../../../components/ui/Spinner.jsx';
import { Cell } from '../cells.jsx';
import { useBlockData } from '../useApps.js';
import { BlockFrame, SampleNote } from './BlockFrame.jsx';

export default function DetailsBlock({ block, onSettings }) {
  const data = useBlockData(block.id, {});
  if (!block.object) return <BlockFrame block={block} onSettings={onSettings}><p className="text-sm text-muted">Choose an object in the settings.</p></BlockFrame>;
  return (
    <BlockFrame block={block} onSettings={onSettings}>
      {data.isPending ? <div className="grid place-items-center py-6"><Spinner /></div> : (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {data.data.fields.map((f) => <div key={f.key} className="min-w-0 border-b border-line pb-2"><dt className="text-xs font-medium text-muted">{f.label}</dt><dd className="mt-0.5 min-w-0 text-sm text-ink"><Cell type={f.type} value={f.value} /></dd></div>)}
        </dl>
      )}
      <SampleNote sample={data.data?.sample} />
    </BlockFrame>
  );
}
