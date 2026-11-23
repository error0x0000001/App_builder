import { chatApi } from '../../api/endpoints.js';
import { Icon } from '../../components/ui/Icon.jsx';
import { cn } from '../../lib/cn.js';
import { patchMessage } from './chatCache.js';
import { useQueryClient } from '@tanstack/react-query';

/** A poll inside a message: tap an option to vote (again to withdraw); bars show the live share of voters. */
export function PollCard({ message, conversationId }) {
  const qc = useQueryClient();
  const { poll } = message;
  const vote = async (index) => {
    const chosen = poll.options.flatMap((o, i) => (o.mine ? [i] : []));
    const next = poll.multi ? (chosen.includes(index) ? chosen.filter((i) => i !== index) : [...chosen, index]) : (chosen.includes(index) ? [] : [index]);
    try { patchMessage(qc, conversationId, message.id, { poll: (await chatApi.vote(conversationId, message.id, next)).poll }); } catch { /* the next realtime event or refetch corrects the view */ }
  };
  return (
    <div className="min-w-56 space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Icon name="poll" className="size-4 shrink-0" />{message.body}</p>
      <p className="text-xs text-muted">{poll.multi ? 'Select one or more' : 'Select one'}</p>
      <ul className="space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = poll.voters ? Math.round((o.votes / poll.voters) * 100) : 0;
          return (
            <li key={o.text}>
              <button type="button" role={poll.multi ? 'checkbox' : 'radio'} aria-checked={o.mine} onClick={() => vote(i)} className={cn('relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring', 'border-line-strong bg-surface')}>
                <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${pct}%` }} aria-hidden="true" />
                <span className="relative flex items-center gap-2">
                  <span className={cn('grid size-4 shrink-0 place-items-center border', poll.multi ? 'rounded' : 'rounded-full', o.mine ? 'border-accent bg-accent' : 'border-line-strong')}>{o.mine && <Icon name="check" className="size-3 text-accent-ink" />}</span>
                  <span className="min-w-0 flex-1 break-words">{o.text}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{o.votes}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">{poll.voters} {poll.voters === 1 ? 'vote' : 'votes'}</p>
    </div>
  );
}
