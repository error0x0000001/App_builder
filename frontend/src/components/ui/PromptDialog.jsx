import { useState } from 'react';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';
import { Input } from './Input.jsx';

/** Asks for one short text (a name) and confirms. */
export function PromptDialog({ open, title, label = 'Name', initial = '', confirmLabel = 'Save', hint, onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!open) return null;
  const submit = async (e) => { e.preventDefault(); if (!value.trim()) return; setBusy(true); setError(null); try { await onSubmit(value.trim()); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} label={title}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <Input label={label} autoFocus value={value} maxLength={80} hint={hint} error={error ?? undefined} onChange={(e) => setValue(e.target.value)} />
        <div className="flex justify-end gap-2"><Button variant="neutral" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={!value.trim()}>{confirmLabel}</Button></div>
      </form>
    </Dialog>
  );
}
