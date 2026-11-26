import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { appsApi, objectsApi } from '../../../api/endpoints.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Sheet } from '../../../components/ui/Sheet.jsx';
import { ErrorBox } from '../../setup/objects/shared.jsx';
import { useStudio } from '../useApps.js';

/** Choose a block, then (when it shows records) the object it shows. The server fills in sensible fields and buttons. */
export function AddBlockSheet({ open, onClose, tabId, columnId, meta }) {
  const { run } = useStudio();
  const [kind, setKind] = useState(null); const [objectId, setObjectId] = useState(''); const [title, setTitle] = useState(''); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const objects = useQuery({ queryKey: ['objects', 'for-blocks'], queryFn: () => objectsApi.list({ limit: 200 }), staleTime: 30_000, enabled: open });
  const k = meta.blockKinds.find((x) => x.id === kind);
  const create = async () => {
    setBusy(true); setError(null);
    try { await run(() => appsApi.addBlock(tabId, { kind, objectId: k.needsObject ? objectId : undefined, title: title || undefined, columnId })); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} width="w-[34rem]" icon={k?.icon ?? 'layers'} title={k ? `Add a ${k.label.toLowerCase()}` : 'Add a block'} description={k ? k.description : 'Choose what to put on the page.'}
      footer={k ? <div className="flex items-center justify-between"><Button variant="ghost" onClick={() => setKind(null)}><Icon name="chevron-left" />Change block</Button><Button loading={busy} disabled={k.needsObject && !objectId} onClick={create}>Add block</Button></div> : null}>
      {!k ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {meta.blockKinds.map((b) => (
            <button key={b.id} type="button" onClick={() => setKind(b.id)} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left outline-none transition-colors hover:border-accent hover:bg-accent-soft focus-visible:ring-4 focus-visible:ring-ring">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-strong"><Icon name={b.icon} className="size-4" /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{b.label}</span><span className="block text-xs text-muted">{b.description}</span></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {k.needsObject && <Select label="Object" required placeholder="Choose an object" hint={objects.data?.items?.length === 0 ? 'Create an object under Setup › Object Manager first.' : 'The records this block shows.'} options={(objects.data?.items ?? []).map((o) => ({ value: o.id, label: o.label }))} value={objectId} onChange={setObjectId} />}
          <Input label="Title" hint="Optional. Defaults to the object’s name." value={title} onChange={(e) => setTitle(e.target.value)} />
          <ErrorBox error={error} />
        </div>
      )}
    </Sheet>
  );
}
