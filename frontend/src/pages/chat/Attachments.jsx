import { formatBytes, fileKindOf } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { driveApi } from '../../api/endpoints.js';
import { cn } from '../../lib/cn.js';
import { FileTypeIcon } from '../documents/FileTypeIcon.jsx';

/** Adds the fields the Documents components expect (`type`, `kind`) to the small record a message stores for each attachment. */
export const asDriveFile = (a) => ({ type: 'file', kind: fileKindOf(a.name, a.mime), ...a });

/** A picture, loaded through a short-lived signed link (so it works in <img> and respects the conversation's membership). */
export function ImageThumb({ file, className, onClick }) {
  const { data } = useQuery({ queryKey: ['drive', 'link', file.id], queryFn: () => driveApi.link(file.id), staleTime: 4 * 60_000 });
  return (
    <button type="button" onClick={onClick} aria-label={`Open ${file.name}`} className={cn('block overflow-hidden rounded-lg bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
      {data?.url ? <img src={data.url} alt={file.name} loading="lazy" className="size-full object-cover" /> : <span className="block size-full animate-pulse bg-line" />}
    </button>
  );
}

/** A voice note or audio file: plays in place through the same short-lived link. */
export function AudioAttachment({ file, mine }) {
  const { data } = useQuery({ queryKey: ['drive', 'link', file.id], queryFn: () => driveApi.link(file.id), staleTime: 4 * 60_000 });
  return (
    <div className={cn('flex min-w-56 items-center gap-2 rounded-lg border px-2 py-1.5', mine ? 'border-accent-ink/30 bg-black/10' : 'border-line bg-surface')}>
      <audio controls preload="metadata" src={data?.url} aria-label={file.name} className="h-9 w-full min-w-0" />
    </div>
  );
}

/** What a message carries: pictures as a grid, audio as a player, everything else as file cards. Clicking opens the preview. */
export function MessageAttachments({ attachments, mine, onOpen }) {
  const files = attachments.map(asDriveFile);
  const images = files.filter((f) => f.kind === 'image');
  const audio = files.filter((f) => f.kind === 'audio');
  const others = files.filter((f) => f.kind !== 'image' && f.kind !== 'audio');
  return (
    <div className="mb-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {images.map((f) => <ImageThumb key={f.id} file={f} onClick={() => onOpen(f)} className={images.length === 1 ? 'aspect-[4/3] w-64 max-w-full' : 'aspect-square'} />)}
        </div>
      )}
      {audio.map((f) => <AudioAttachment key={f.id} file={f} mine={mine} />)}
      {others.map((f) => (
        <button key={f.id} type="button" onClick={() => onOpen(f)} className={cn('flex w-full min-w-48 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', mine ? 'border-accent-ink/30 bg-black/10' : 'border-line bg-surface')}>
          <FileTypeIcon item={f} className="size-8" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{f.name}</span><span className="block text-xs opacity-75">{formatBytes(f.size)}</span></span>
        </button>
      ))}
    </div>
  );
}
