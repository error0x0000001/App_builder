import { useState } from 'react';
import { squareJpeg } from '../../lib/squareJpeg.js';
import { Alert } from './Alert.jsx';
import { Avatar } from './Avatar.jsx';
import { Button } from './Button.jsx';
import { useFilePicker } from './FilePicker.jsx';

/** A profile photo with Change / Remove. The chosen image is cropped to a square and shrunk in the browser; `onUpload(file)` / `onRemove()` do the saving. */
export function PhotoUpload({ name, src, onUpload, onRemove }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (task) => { setBusy(true); setError(null); try { await task(); } catch (e) { setError(e.message || 'Something went wrong'); } finally { setBusy(false); } };
  const { open, input } = useFilePicker({ multiple: false, accept: 'image/png,image/jpeg,image/webp,image/gif', onPick: ([file]) => run(async () => onUpload(await squareJpeg(file))) });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar name={name} src={src} size="size-20" className="text-xl" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="neutral" onClick={open} loading={busy}>{src ? 'Change photo' : 'Upload photo'}</Button>
          {src && <Button size="sm" variant="ghost" onClick={() => run(onRemove)} disabled={busy}>Remove</Button>}
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {input}
    </div>
  );
}
