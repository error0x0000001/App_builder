import { useState } from 'react';
import { formatBytes } from '@app/shared';
import { Icon } from '../../components/ui/Icon.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { cn } from '../../lib/cn.js';

/** Bottom-right upload panel (like Drive's): per-file progress, cancel, retry, collapse and dismiss. */
export function UploadTray({ items, onCancel, onRetry, onClear }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!items.length) return null;
  const active = items.filter((i) => i.status === 'uploading' || i.status === 'queued').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const title = active ? `Uploading ${active} ${active === 1 ? 'file' : 'files'}…` : failed ? `${failed} upload${failed === 1 ? '' : 's'} failed` : `${items.filter((i) => i.status === 'done').length} uploaded`;
  return (
    <section aria-label="Uploads" className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface text-ink">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" role="status">{title}</h2>
        <button type="button" aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'} onClick={() => setCollapsed((c) => !c)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2"><Icon name="chevron-down" className={cn('size-4 transition-transform', collapsed && 'rotate-180')} /></button>
        <button type="button" aria-label="Dismiss finished uploads" onClick={onClear} disabled={Boolean(active)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-40"><Icon name="x" className="size-4" /></button>
      </header>
      {!collapsed && (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                {item.status === 'uploading' || item.status === 'queued'
                  ? <ProgressBar value={item.progress * 100} label={`Uploading ${item.name}`} className="mt-1.5 h-1.5" />
                  : <p className={cn('mt-0.5 truncate text-xs', item.status === 'error' ? 'text-danger' : 'text-muted')}>{item.status === 'done' ? `Uploaded · ${formatBytes(item.size)}` : item.status === 'cancelled' ? 'Cancelled' : item.error}</p>}
              </div>
              {(item.status === 'uploading' || item.status === 'queued') && <button type="button" aria-label={`Cancel ${item.name}`} onClick={() => onCancel(item.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2"><Icon name="x" className="size-4" /></button>}
              {(item.status === 'error' || item.status === 'cancelled') && <button type="button" aria-label={`Retry ${item.name}`} onClick={() => onRetry(item.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2"><Icon name="refresh" className="size-4" /></button>}
              {item.status === 'done' && <Icon name="check-circle" className="size-5 shrink-0 text-success" />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
