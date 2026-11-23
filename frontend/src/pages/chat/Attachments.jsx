import { formatBytes, fileKindOf } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { driveApi } from '../../api/endpoints.js';
import { cn } from '../../lib/cn.js';
import { FileTypeIcon } from '../documents/FileTypeIcon.jsx';
import { VoiceNote } from './VoiceNote.jsx';

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

/**
 * What a message carries, in Untitled UI's message styles: pictures large with a "name · size" caption, voice notes as the waveform player, other files as a white bordered
 * card with the file-type icon. Clicking a picture or file opens the preview.
 */
export function MessageAttachments({ attachments, onOpen }) {
  const files = attachments.map(asDriveFile);
  const images = files.filter((f) => f.kind === 'image');
  const audio = files.filter((f) => f.kind === 'audio');
  const others = files.filter((f) => f.kind !== 'image' && f.kind !== 'audio');
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className={cn('grid gap-1.5', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {images.map((f) => (
            <figure key={f.id} className="min-w-0">
              <ImageThumb file={f} onClick={() => onOpen(f)} className={images.length === 1 ? 'aspect-[4/3] w-72 max-w-full' : 'aspect-square w-full'} />
              <figcaption className="mt-1 flex items-baseline justify-between gap-3 text-sm text-ink"><span className="min-w-0 truncate">{f.name}</span><span className="shrink-0 text-xs text-muted">{formatBytes(f.size)}</span></figcaption>
            </figure>
          ))}
        </div>
      )}
      {audio.map((f) => <VoiceNote key={f.id} file={f} />)}
      {others.map((f) => (
        <button key={f.id} type="button" onClick={() => onOpen(f)} className="flex w-72 max-w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring">
          <FileTypeIcon item={f} className="size-9" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{f.name}</span><span className="block text-sm text-muted">{formatBytes(f.size)}</span></span>
        </button>
      ))}
    </div>
  );
}
