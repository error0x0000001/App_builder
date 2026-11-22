import { useInfiniteQuery } from '@tanstack/react-query';
import { AUDIT_EVENT_LABELS } from '@app/shared';
import { meApi } from '../../../api/endpoints.js';
import { cursorPagination } from '../../../api/queries.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Section } from '../../../components/ui/Card.jsx';
import { List, ListRow } from '../../../components/ui/ListRow.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { formatDateTime } from '../../../lib/format.js';
import { describeUserAgent } from '../../../lib/userAgent.js';

export function ActivitySection() {
  const query = useInfiniteQuery({ queryKey: ['activity'], queryFn: ({ pageParam }) => meApi.activity({ after: pageParam }), ...cursorPagination });
  const events = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Section title="Login history" description="Recent security activity on your account.">
      {query.isLoading ? <Spinner /> : (
        <div className="space-y-3">
          <List>
            {events.map((e) => (
              <ListRow key={e.id} title={AUDIT_EVENT_LABELS[e.type] ?? e.type} subtitle={`${formatDateTime(e.createdAt)} · ${e.ip ?? 'Unknown IP'} · ${describeUserAgent(e.userAgent ?? '')}`} />
            ))}
          </List>
          {query.hasNextPage && <Button variant="neutral" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Load more</Button>}
        </div>
      )}
    </Section>
  );
}
