import { useEffect, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Input.jsx';

/** One-field dialog for "New folder" and "Rename". `onSubmit(name)` may throw (its message is shown); the dialog closes when it resolves. */
export function NameDialog({ open, title, label = 'Name', initial = '', submitLabel = 'Save', onSubmit, onClose }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(initial); setError(null); } }, [open, initial]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) { setError('Enter a name'); return; }
    setBusy(true); setError(null);
    try { await onSubmit(name.trim()); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} label={title} className="max-w-md">
      <form onSubmit={submit} className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label={label} value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} maxLength={200} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="neutral" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" size="sm" loading={busy}>{submitLabel}</Button>
        </div>
      </form>
    </Dialog>
  );
}
