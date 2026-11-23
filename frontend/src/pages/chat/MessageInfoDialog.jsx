import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../../api/endpoints.js';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { formatDateTime } from '../../lib/format.js';

const Group = ({ title, ids, people, icon }) => (ids.length > 0 && (
  <section>
    <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Icon name={icon} className="size-3.5" />{title} ({ids.length})</h3>
    <ul className="divide-y divide-line">{ids.map((id) => <li key={id} className="flex items-center gap-3 py-2"><Avatar name={people[id]?.name} src={people[id]?.avatar} size="size-8" /><span className="truncate text-sm font-medium text-ink">{people[id]?.name ?? 'Someone'}</span></li>)}</ul>
  </section>
));

/** Who has read a message you sent (the read state is each person's own cursor, so this is exact for reads). */
export function MessageInfoDialog({ target, onClose }) {
  const { data, isPending, error } = useQuery({ queryKey: ['chat', 'info', target?.conversationId, target?.id], queryFn: () => chatApi.messageInfo(target.conversationId, target.id), enabled: Boolean(target), gcTime: 0 });
  if (!target) return null;
  return (
    <Dialog open onClose={onClose} label="Message info" className="max-w-sm">
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2"><div><h2 className="text-base font-semibold text-ink">Message info</h2>{data && <p className="text-xs text-muted">Sent {formatDateTime(data.sentAt)}</p>}</div><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><Icon name="x" className="size-4" /></Button></div>
        {isPending && <div className="flex justify-center py-6"><Spinner /></div>}
        {error && <p className="text-sm text-danger">{error.message}</p>}
        {data && (
          <div className="space-y-4">
            <Group title="Read by" ids={data.readBy} people={data.people} icon="check-circle" />
            <Group title="Not read yet" ids={data.pending} people={data.people} icon="clock" />
            {!data.readBy.length && !data.pending.length && <p className="text-sm text-muted">Nobody else is in this conversation.</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
