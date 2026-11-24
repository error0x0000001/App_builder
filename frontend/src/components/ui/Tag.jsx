import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/**
 * Untitled UI "Tag": a small white chip with a thin ring, optional leading dot (any theme colour) and a close ×.
 * Use `dot="success" | "accent" | "warning" | "danger" | <css colour>`; `onClose` adds the remove button.
 */
const DOTS = { success: 'var(--success)', accent: 'var(--accent)', warning: 'var(--warning)', danger: 'var(--danger)' };

export function Tag({ children, dot, onClose, closeLabel = 'Remove', className }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-sm font-medium text-ink ring-1 ring-inset ring-line-strong', className)}>
      {dot && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: DOTS[dot] ?? dot }} />}
      <span className="truncate">{children}</span>
      {onClose && <button type="button" aria-label={closeLabel} onClick={onClose} className="-mr-0.5 grid size-4 shrink-0 place-items-center rounded text-placeholder outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"><Icon name="x" className="size-3" /></button>}
    </span>
  );
}
