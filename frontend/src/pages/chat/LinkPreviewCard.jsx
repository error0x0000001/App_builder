import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../../api/endpoints.js';
import { Icon } from '../../components/ui/Icon.jsx';
import { cn } from '../../lib/cn.js';

/** Title, description and site of the first link in a message (fetched and cached by the server; no remote image is loaded in your browser). */
export function LinkPreviewCard({ url, mine }) {
  const { data } = useQuery({ queryKey: ['chat', 'link-preview', url], queryFn: () => chatApi.linkPreview(url), staleTime: 24 * 3600_000, retry: false });
  const preview = data?.preview;
  if (!preview) return null;
  return (
    <a href={preview.url} target="_blank" rel="noopener noreferrer" className={cn('mt-1.5 block rounded-lg border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', mine ? 'border-accent-ink/30 bg-black/10' : 'border-line bg-surface')}>
      <span className="flex items-center gap-1 text-xs opacity-75"><Icon name="globe" className="size-3" />{preview.site}</span>
      <span className="mt-0.5 line-clamp-2 block text-sm font-semibold">{preview.title}</span>
      {preview.description && <span className="line-clamp-2 mt-0.5 block text-xs opacity-80">{preview.description}</span>}
    </a>
  );
}
