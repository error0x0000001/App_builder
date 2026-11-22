import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

/**
 * Floating side sheet: a bordered card inset from the window edge on the right. There is no dimming backdrop, so the page
 * stays visible and live while you change things in the sheet. Escape or the close button dismisses it.
 */
export function Sheet({ open, onClose, title, description, footer, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  return createPortal(
    <aside role="dialog" aria-label={title} className="sheet-in fixed bottom-2 right-2 top-2 z-[75] flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink">
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose} className="-mr-1.5 -mt-1"><Icon name="x" className="size-4" /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">{children}</div>
      {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
    </aside>,
    document.body,
  );
}
