import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

/**
 * Floating side sheet: a bordered card inset from the window edge on the right. The page behind is dimmed and slightly
 * blurred (light enough that changes you make in the sheet stay visible live); clicking it, Escape or the close button dismisses.
 * Sheets stack: a sheet opened from another (`level` 1, usually wider) sits on top, and Escape closes only the top one.
 */
const openSheets = []; // ids, topmost last

export function Sheet({ open, onClose, title, description, footer, level = 0, width = 'w-[22rem]', children }) {
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    openSheets.push(id);
    const onKey = (event) => { if (event.key === 'Escape' && openSheets[openSheets.length - 1] === id) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); openSheets.splice(openSheets.indexOf(id), 1); };
  }, [open, onClose, id]);
  if (!open) return null;

  return createPortal(
    <>
      <div aria-hidden="true" onMouseDown={onClose} style={{ zIndex: 74 + level * 4 }} className="backdrop-in fixed inset-0 bg-black/25 backdrop-blur-[2px]" />
    <aside role="dialog" aria-label={title} style={{ zIndex: 75 + level * 4 }} className={`sheet-in fixed bottom-2 right-2 top-2 flex ${width} max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink`}>
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose} className="-mr-1.5 -mt-1"><Icon name="x" className="size-4" /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">{children}</div>
      {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
    </aside>
    </>,
    document.body,
  );
}
