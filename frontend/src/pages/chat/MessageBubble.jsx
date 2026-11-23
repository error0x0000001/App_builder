import { CHAT_REACTIONS } from '@app/shared';
import { memo, useRef, useState } from 'react';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { EmojiPicker } from '../../components/ui/EmojiPicker.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { cn } from '../../lib/cn.js';
import { formatTime, nameOf } from './chatFormat.js';

const URL_PATTERN = /(https?:\/\/[^\s<>]+[^\s<>.,;:!?)\]'"])/g;

/** Text with clickable links (never HTML: the body is rendered as text nodes). */
function Linkified({ text }) {
  return text.split(URL_PATTERN).map((part, i) => (i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline decoration-current/50 underline-offset-2 hover:decoration-current">{part}</a>
    : part));
}

const ActionButton = ({ label, icon, onClick, buttonRef }) => (
  <button ref={buttonRef} type="button" aria-label={label} title={label} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
    <Icon name={icon} className="size-4" />
  </button>
);

/** Ticks for my message in a DM: one = sent, two = the other person has read it. */
const Ticks = ({ read, pending, failed }) => (failed
  ? <span className="text-danger">Not sent</span>
  : <span aria-label={pending ? 'Sending' : read ? 'Read' : 'Sent'} className={cn('inline-flex', read ? 'text-accent-ink' : 'opacity-70')}>{pending ? '…' : read ? '✓✓' : '✓'}</span>);

function MessageBubbleImpl({ message, mine, people, group, showSender, firstOfRun, peerRead, flipMenu, onReply, onReact, onEdit, onDelete, onForward, onPin, onRetry, onJumpTo, canDeleteOthers }) {
  const [picker, setPicker] = useState(false);
  const pickerButton = useRef(null);
  const deleted = Boolean(message.deletedAt);
  const sender = nameOf(people, message.senderId);

  return (
    <div className={cn('group/msg flex items-end gap-2', mine && 'flex-row-reverse', firstOfRun ? 'mt-3' : 'mt-0.5')}>
      {!mine && group && (firstOfRun ? <Avatar name={sender} size="size-7" /> : <span className="size-7 shrink-0" aria-hidden="true" />)}
      <div className={cn('flex min-w-0 max-w-[min(34rem,82%)] flex-col', mine ? 'items-end' : 'items-start')}>
        {showSender && firstOfRun && !mine && <span className="mb-0.5 px-1 text-xs font-semibold text-muted">{sender}</span>}
        <div className={cn('flex items-center gap-1', mine && 'flex-row-reverse')}>
          <div
            className={cn('min-w-0 break-words rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]', mine ? 'bg-accent text-accent-ink' : 'border border-line bg-surface-2 text-ink', mine ? 'rounded-br-md' : 'rounded-bl-md', message.pending && 'opacity-70', deleted && 'italic opacity-70')}
          >
            {message.forwarded && !deleted && <p className="mb-1 flex items-center gap-1 text-xs opacity-80"><Icon name="forward" className="size-3" />Forwarded</p>}
            {message.replyPreview && !deleted && (
              <button type="button" onClick={() => onJumpTo(message.replyPreview.id)} className={cn('mb-1.5 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs', mine ? 'border-accent-ink/60 bg-black/10' : 'border-accent bg-surface')}>
                <span className="block font-semibold">{message.replyPreview.senderId === message.senderId && mine ? 'You' : nameOf(people, message.replyPreview.senderId)}</span>
                <span className="line-clamp-2 opacity-90">{message.replyPreview.deleted ? 'This message was deleted' : message.replyPreview.body}</span>
              </button>
            )}
            {deleted ? 'This message was deleted' : <p className="whitespace-pre-wrap"><Linkified text={message.body} /></p>}
            <span className={cn('mt-0.5 flex items-center justify-end gap-1.5 text-[11px] leading-4', mine ? 'text-accent-ink/80' : 'text-muted')}>
              {message.editedAt && !deleted && <span>edited</span>}
              <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
              {mine && !deleted && !group && <Ticks read={peerRead} pending={message.pending} failed={message.failed} />}
              {mine && !deleted && group && message.failed && <Ticks failed />}
            </span>
          </div>

          {!deleted && !message.pending && !message.failed && (
            <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
              <ActionButton label="React" icon="smile" buttonRef={pickerButton} onClick={() => setPicker((o) => !o)} />
              <ActionButton label="Reply" icon="reply" onClick={() => onReply(message)} />
              <DropdownMenu>
                <DropdownMenuTrigger>{(props) => <button {...props} type="button" aria-label="More actions" className="grid size-7 place-items-center rounded-md text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[open=true]:opacity-100"><Icon name="more-horizontal" className="size-4" /></button>}</DropdownMenuTrigger>
                <DropdownMenuContent side={flipMenu ? 'top' : 'bottom'} align={mine ? 'end' : 'start'} className="min-w-44">
                  <DropdownMenuItem icon="copy" onSelect={() => navigator.clipboard?.writeText(message.body)}>Copy text</DropdownMenuItem>
                  <DropdownMenuItem icon="forward" onSelect={() => onForward(message)}>Forward</DropdownMenuItem>
                  <DropdownMenuItem icon="pin" onSelect={() => onPin(message)}>Pin / unpin</DropdownMenuItem>
                  {(mine || canDeleteOthers) && <DropdownMenuSeparator />}
                  {mine && <DropdownMenuItem icon="edit" onSelect={() => onEdit(message)}>Edit</DropdownMenuItem>}
                  {(mine || canDeleteOthers) && <DropdownMenuItem icon="trash" onSelect={() => onDelete(message)} className="text-danger">Delete for everyone</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {message.failed && <button type="button" onClick={() => onRetry(message)} className="mt-1 px-1 text-xs font-semibold text-danger hover:underline">Tap to retry</button>}
        {message.reactions?.length > 0 && !deleted && (
          <ul className={cn('mt-1 flex flex-wrap gap-1', mine && 'justify-end')} aria-label="Reactions">
            {message.reactions.map((r) => (
              <li key={r.emoji}>
                <button type="button" aria-pressed={r.mine} aria-label={`${r.emoji} ${r.count}`} onClick={() => onReact(message, r.emoji)} className={cn('inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring', r.mine ? 'border-accent bg-accent/10 text-link' : 'border-line bg-surface text-ink hover:bg-surface-2')}>
                  <span>{r.emoji}</span><span className="font-semibold">{r.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <EmojiPicker anchorRef={pickerButton} open={picker} onClose={() => setPicker(false)} onPick={(emoji) => onReact(message, emoji)} emojis={[...CHAT_REACTIONS, '🎉', '🔥', '👀', '✅', '😅', '🤝', '💯', '🚀', '😍', '🥳']} />
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
