import { useInfiniteQuery } from '@tanstack/react-query';
import { chatApi } from '../../api/endpoints.js';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { conversationTitle, formatInboxTime, nameOf } from './chatFormat.js';
import { usePeople } from './chatQueries.js';
import { mergePeople } from './chatCache.js';
import { useQueryClient } from '@tanstack/react-query';

/** Your starred messages across every conversation; tapping one opens its conversation. */
export function StarredMessages({ onOpen }) {
  const qc = useQueryClient();
  const people = usePeople();
  const query = useInfiniteQuery({
    queryKey: ['chat', 'starred'],
    queryFn: async ({ pageParam }) => { const data = await chatApi.starred({ before: pageParam }); mergePeople(qc, data.people); return data; },
    initialPageParam: undefined, getNextPageParam: (last) => last.nextBefore ?? undefined, staleTime: 15_000,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  if (query.isPending) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!items.length) return <div className="px-6 py-12 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full border border-line bg-surface-2"><Icon name="star" className="size-6 text-muted" /></div><p className="text-sm font-semibold text-ink">No starred messages</p><p className="mt-1 text-sm text-muted">Open a message’s menu and choose Star to keep it here.</p></div>;
  return (
    <div>
      <ul aria-label="Starred messages">
        {items.map(({ message, conversation }) => (
          <li key={message.id}>
            <button type="button" onClick={() => onOpen(conversation.id, message.id)} className="block w-full px-3 py-2.5 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
              <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{conversationTitle(conversation, people)}</span><time className="shrink-0 text-xs text-muted">{formatInboxTime(message.createdAt)}</time></span>
              <span className="line-clamp-2 text-sm text-muted"><span className="font-medium">{nameOf(people, message.senderId).split(' ')[0]}:</span> {message.kind === 'poll' ? `Poll: ${message.body}` : message.body || 'Attachment'}</span>
            </button>
          </li>
        ))}
      </ul>
      {query.hasNextPage && <div className="p-3"><Button size="sm" variant="ghost" fullWidth loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Show more</Button></div>}
    </div>
  );
}
