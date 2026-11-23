import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { driveApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { FileTypeIcon } from './FileTypeIcon.jsx';

/** Folder picker for "Move to…": drill into folders, then "Move here". `items` = [{ type, id, name }] being moved. */
export function MoveDialog({ open, items, onClose, onMove }) {
  const [trail, setTrail] = useState([]); // [{ id, name }] from the top
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const here = trail.at(-1) ?? null;
  useEffect(() => { if (open) { setTrail([]); setError(null); } }, [open]);
  const { data, isPending } = useQuery({ queryKey: ['drive', 'move', here?.id ?? 'root'], queryFn: () => driveApi.list(here ? { folder: here.id } : {}), enabled: open, gcTime: 0 });
  const moving = new Set(items.map((i) => i.id));
  const folders = (data?.folders ?? []).filter((f) => f.kind === 'folder' && !moving.has(f.id));
  const movingFiles = items.some((i) => i.type === 'file');
  const canMoveHere = here ? data?.folder?.role && data.folder.role !== 'viewer' : !movingFiles; // files always live in a folder

  const submit = async () => {
    setBusy(true); setError(null);
    try { await onMove(here?.id ?? null); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} label="Move to" className="max-w-md">
      <div className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-ink">Move {items.length === 1 ? `“${items[0].name}”` : `${items.length} items`}</h2>
        <nav aria-label="Location" className="flex flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={() => setTrail([])} className="rounded px-1 font-medium text-link hover:underline">My Drive</button>
          {trail.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1"><Icon name="chevron-right" className="size-3.5 text-muted" /><button type="button" onClick={() => setTrail(trail.slice(0, i + 1))} className="rounded px-1 font-medium text-link hover:underline">{crumb.name}</button></span>
          ))}
        </nav>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="h-64 overflow-y-auto rounded-lg border border-line">
          {isPending ? <div className="flex justify-center py-10"><Spinner /></div> : (
            <ul>
              {folders.map((f) => (
                <li key={f.id}><button type="button" onClick={() => setTrail([...trail, { id: f.id, name: f.name }])} className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left text-sm last:border-0 hover:bg-surface-2">
                  <FileTypeIcon item={f} /><span className="min-w-0 flex-1 truncate">{f.name}</span><Icon name="chevron-right" className="size-4 text-muted" />
                </button></li>
              ))}
              {!folders.length && <li className="px-3 py-10 text-center text-sm text-muted">No folders here</li>}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="neutral" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={busy} disabled={!canMoveHere}>Move here</Button>
        </div>
      </div>
    </Dialog>
  );
}
