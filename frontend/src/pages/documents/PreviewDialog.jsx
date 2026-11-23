import { formatBytes } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { driveApi } from '../../api/endpoints.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { formatDateTime } from '../../lib/format.js';
import { FileTypeIcon } from './FileTypeIcon.jsx';

const TEXT_LIMIT = 256 * 1024;

function TextBody({ url }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['drive', 'text', url],
    queryFn: async () => { const res = await fetch(url, { headers: { Range: `bytes=0-${TEXT_LIMIT - 1}` } }); if (!res.ok && res.status !== 206) throw new Error('Could not load the preview'); return res.text(); },
  });
  if (isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <p className="py-16 text-center text-sm text-muted">{error.message}</p>;
  return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words bg-surface-2 p-4 text-xs leading-5 text-ink">{data}</pre>;
}

/** Full preview of a file in the browser (images, PDF, audio, video, text and code). ← → move between the files of the folder. */
export function PreviewDialog({ file, files, onClose, onNavigate, onDownload }) {
  const open = Boolean(file);
  const { data, isPending } = useQuery({ queryKey: ['drive', 'link', file?.id], queryFn: () => driveApi.link(file.id), enabled: open, staleTime: 4 * 60_000 });
  const index = files.findIndex((f) => f.id === file?.id);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight' && files[index + 1]) onNavigate(files[index + 1]);
      if (e.key === 'ArrowLeft' && files[index - 1]) onNavigate(files[index - 1]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, files, index, onNavigate]);

  const url = data?.url;
  const body = () => {
    if (isPending || !url) return <div className="flex justify-center py-24"><Spinner /></div>;
    if (file.kind === 'image') return <img src={url} alt={file.name} className="mx-auto max-h-[60vh] max-w-full object-contain" />;
    if (file.kind === 'pdf') return <iframe title={file.name} src={url} className="h-[60vh] w-full border-0 bg-surface" />;
    if (file.kind === 'video') return <video src={url} controls className="mx-auto max-h-[60vh] max-w-full"><track kind="captions" /></video>;
    if (file.kind === 'audio') return <div className="grid place-items-center py-20"><audio src={url} controls /></div>;
    if (['text', 'code'].includes(file.kind) && file.size <= 5 * 1024 * 1024) return <TextBody url={url} />;
    return (
      <div className="grid place-items-center gap-3 py-20 text-center">
        <FileTypeIcon item={file} className="size-14" />
        <p className="text-sm text-muted">No preview for this type of file.</p>
        <Button size="sm" onClick={() => onDownload(file)}><Icon name="download" className="size-4" />Download</Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} label={file ? `Preview ${file.name}` : 'Preview'} className="max-w-4xl">
      {file && (
        <>
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <FileTypeIcon item={file} />
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-ink">{file.name}</h2><p className="truncate text-xs text-muted">{formatBytes(file.size)} · {file.ownerName ?? 'Unknown'} · {formatDateTime(file.updatedAt)}</p></div>
            <Button size="icon" variant="ghost" aria-label="Previous file" disabled={index <= 0} onClick={() => onNavigate(files[index - 1])}><Icon name="chevron-left" className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Next file" disabled={index < 0 || index >= files.length - 1} onClick={() => onNavigate(files[index + 1])}><Icon name="chevron-right" className="size-4" /></Button>
            <Button size="sm" variant="neutral" onClick={() => onDownload(file)}><Icon name="download" className="size-4" />Download</Button>
            <Button size="icon" variant="ghost" aria-label="Close preview" onClick={onClose}><Icon name="x" className="size-4" /></Button>
          </header>
          <div className="bg-surface-2/40">{body()}</div>
        </>
      )}
    </Dialog>
  );
}
