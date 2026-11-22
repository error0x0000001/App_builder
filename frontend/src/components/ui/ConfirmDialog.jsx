import { useState } from 'react';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';

/** "Are you sure?" modal. `onConfirm` may be async; the button shows progress and the dialog closes when it resolves. */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} label={title} className="max-w-md">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="neutral" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={confirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}
