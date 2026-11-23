import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../../api/endpoints.js';
import { Icon } from '../../components/ui/Icon.jsx';

/** Untitled UI "Message link preview": a white card inside the bubble with the link icon, the page title and description (fetched and cached by the server; no remote image is loaded). */
export function LinkPreviewCard({ url }) {
  const { data } = useQuery({ queryKey: ['chat', 'link-preview', url], queryFn: () => chatApi.linkPreview(url), staleTime: 24 * 3600_000, retry: false });
  const preview = data?.preview;
  if (!preview) return null;
  return (
    <a href={preview.url} target="_blank" rel="noopener noreferrer" className="mb-2 flex items-start gap-2 rounded-md border border-line bg-surface px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Icon name="link" className="mt-0.5 size-4 shrink-0 text-muted" />
      <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{preview.title}</span>{preview.description && <span className="block truncate text-sm text-muted">{preview.description}</span>}</span>
    </a>
  );
}
