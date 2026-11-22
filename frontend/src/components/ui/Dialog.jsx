import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';

/** Modal overlay: portal, backdrop click and Escape close it. Content is responsible for autofocus. */
export function Dialog({ open, onClose, label, className, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[15vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} className={cn('w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface text-ink', className)}>{children}</div>
    </div>,
    document.body,
  );
}
