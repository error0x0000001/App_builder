import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';

const VARIANT = { primary: 'primary', default: 'neutral', danger: 'danger', link: 'ghost' };

/**
 * The buttons of a block (toolbar) or of a row. They look and open like the real thing, but do nothing yet: a drawer, dialog or page opens
 * empty with the button's popup title — what a button does is configured later.
 */
export function ActionBar({ actions, size = 'sm', className }) {
  const [open, setOpen] = useState(null);
  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;
  return (
    <>
      <div className={className ?? 'flex flex-wrap items-center gap-2'}>
        {visible.map((a) => (
          <Button key={a.id} size={size} variant={VARIANT[a.style] ?? 'neutral'} onClick={(e) => { e.stopPropagation(); if (a.openMode !== 'none') setOpen(a); }}>
            {a.icon && <Icon name={a.icon} className="size-4" />}{a.label}
          </Button>
        ))}
      </div>
      {open?.openMode === 'drawer' && <Sheet open onClose={() => setOpen(null)} width="w-[28rem]" icon={open.icon || 'layers'} title={open.popupTitle || open.label} description="What this button does is set up later."><p className="text-sm text-muted">Nothing is connected to this button yet.</p></Sheet>}
      {open && open.openMode !== 'drawer' && (
        <Dialog open onClose={() => setOpen(null)} label={open.popupTitle || open.label}>
          <div className="space-y-3 p-5"><h2 className="text-base font-semibold text-ink">{open.popupTitle || open.label}</h2><p className="text-sm text-muted">Nothing is connected to this button yet.</p><div className="flex justify-end"><Button variant="neutral" onClick={() => setOpen(null)}>Close</Button></div></div>
        </Dialog>
      )}
    </>
  );
}
