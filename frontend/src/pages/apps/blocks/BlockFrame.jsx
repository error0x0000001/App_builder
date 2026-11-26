import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { ActionBar } from '../ActionBar.jsx';
import { appsApi } from '../../../api/endpoints.js';
import { useStudio } from '../useApps.js';
import { cn } from '../../../lib/cn.js';

/** Every block sits in this frame: title, toolbar buttons, and — in Studio mode — the controls to move, configure and remove it. */
export function BlockFrame({ block, children, onSettings, toolbar, bare = false, footerActions = false }) {
  const { studio, run } = useStudio();
  const kind = block.kind;
  return (
    <section className={cn('group/block relative flex min-w-0 flex-col rounded-xl border bg-surface', studio ? 'mt-3 border-dashed border-accent/60 pt-4' : 'border-line', bare && 'border-transparent bg-transparent')} style={block.heightPx ? { minHeight: block.heightPx } : undefined}>
      {studio && (
        <div className="absolute -top-3 left-3 right-3 z-10 flex items-center gap-1">
          <Badge tone="accent">{kind}</Badge>
          <span className="ml-auto flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
            {[['up', 'chevron-up', 'Move up'], ['down', 'chevron-down', 'Move down'], ['left', 'chevron-left', 'Move left'], ['right', 'chevron-right', 'Move right']].map(([d, icon, label]) => (
              <Button key={d} size="icon" variant="ghost" aria-label={`${label}: ${block.title || kind}`} className="size-7" onClick={() => run(() => appsApi.moveBlock(block.id, d)).catch(() => {})}><Icon name={icon} className="size-4" /></Button>
            ))}
            <Button size="icon" variant="ghost" aria-label={`Settings: ${block.title || kind}`} className="size-7" onClick={onSettings}><Icon name="settings" className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={`Remove: ${block.title || kind}`} className="size-7 text-danger!" onClick={() => run(() => appsApi.deleteBlock(block.id))}><Icon name="trash" className="size-4" /></Button>
          </span>
        </div>
      )}
      {(block.showTitle && block.title) || (!footerActions && block.actions.block.length > 0) || toolbar ? (
        <header className="flex flex-wrap items-center gap-3 px-4 pb-1 pt-4">
          {block.showTitle && block.title && <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{block.title}</h3>}
          {!(block.showTitle && block.title) && <span className="flex-1" />}
          {toolbar}
          {!footerActions && <ActionBar actions={block.actions.block} />}
        </header>
      ) : null}
      <div className="min-h-0 flex-1 p-4">{children}</div>
      {footerActions && block.actions.block.length > 0 && <footer className="border-t border-line px-4 py-3"><ActionBar actions={block.actions.block} /></footer>}
    </section>
  );
}

export const SampleNote = ({ sample }) => (sample ? <p className="mt-3 text-xs text-muted">Sample data — real records appear here once they exist.</p> : null);
