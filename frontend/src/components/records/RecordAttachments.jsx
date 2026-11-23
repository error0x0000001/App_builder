import { formatBytes } from '@app/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { driveApi, download } from '../../api/endpoints.js';
import { FileTypeIcon } from '../../pages/documents/FileTypeIcon.jsx';
import { useUploads } from '../../pages/documents/useUploads.js';
import { Alert } from '../ui/Alert.jsx';
import { Button } from '../ui/Button.jsx';
import { DropZone, useFilePicker } from '../ui/FilePicker.jsx';
import { Icon } from '../ui/Icon.jsx';
import { ProgressBar } from '../ui/ProgressBar.jsx';
import { Spinner } from '../ui/Spinner.jsx';

/**
 * Attachments of one record. Every file is stored in Documents under `Records / <Object> / <record uuid>` and is listed here and there.
 * Viewing needs read access to the record; uploading and deleting need edit access (the server decides, this only reflects it).
 */
export function RecordAttachments({ object, recordId }) {
  const queryClient = useQueryClient();
  const key = ['drive', 'record', object, recordId];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => driveApi.recordFiles(object, recordId), retry: false });
  const [notice, setNotice] = useState(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['drive'] });
  const uploads = useUploads({ onDone: refresh });
  const canUpload = Boolean(data?.canUpload);
  const start = (files) => uploads.add(files, (file, options) => driveApi.uploadRecordFile(object, recordId, file, options));
  const picker = useFilePicker({ onPick: start });
  const run = async (action) => { setNotice(null); try { await action(); await refresh(); } catch (e) { setNotice(e.message); } };
  const pending = uploads.items.filter((i) => i.status !== 'done');

  return (
    <DropZone onFiles={start} disabled={!canUpload} label="Drop to attach" className="rounded-lg border border-line">
      {picker.input}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name="paperclip" className="size-4 text-muted" />
        <h3 className="flex-1 text-sm font-semibold text-ink">Attachments{data ? ` (${data.files.length})` : ''}</h3>
        {data?.folderId && <Link to={`/app/documents?folder=${data.folderId}`} className="text-xs font-medium text-link hover:underline">Open in Documents</Link>}
        {canUpload && <Button type="button" size="sm" variant="neutral" onClick={picker.open}><Icon name="upload" className="size-4" />Attach</Button>}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {(notice || error) && <Alert tone="error" className="m-2">{notice ?? error.message}</Alert>}
        {isPending ? <div className="flex justify-center py-6"><Spinner /></div> : (
          <ul className="divide-y divide-line">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><p className="truncate font-medium text-ink">{i.name}</p>
                  {i.status === 'error' ? <p className="truncate text-xs text-danger">{i.error}</p> : <ProgressBar value={i.progress * 100} label={`Uploading ${i.name}`} className="mt-1 h-1.5" />}</div>
                {i.status === 'error' ? <button type="button" aria-label={`Retry ${i.name}`} onClick={() => uploads.retry(i.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2"><Icon name="refresh" className="size-4" /></button>
                  : <button type="button" aria-label={`Cancel ${i.name}`} onClick={() => uploads.cancel(i.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2"><Icon name="x" className="size-4" /></button>}
              </li>
            ))}
            {data?.files.map((file) => (
              <li key={file.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FileTypeIcon item={file} />
                <div className="min-w-0 flex-1"><p className="truncate font-medium text-ink">{file.name}</p><p className="text-xs text-muted">{formatBytes(file.size)}{file.ownerName ? ` · ${file.ownerName}` : ''}</p></div>
                <button type="button" aria-label={`Download ${file.name}`} onClick={() => run(() => download(`/drive/files/${file.id}/download`, file.name))} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><Icon name="download" className="size-4" /></button>
                {canUpload && <button type="button" aria-label={`Delete ${file.name}`} onClick={() => run(() => driveApi.trash('file', file.id))} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><Icon name="trash" className="size-4" /></button>}
              </li>
            ))}
            {!data?.files.length && !pending.length && <li className="px-3 py-5 text-center text-sm text-muted">{canUpload ? 'No attachments yet. Drop files here or use Attach.' : 'No attachments.'}</li>}
          </ul>
        )}
      </div>
    </DropZone>
  );
}
