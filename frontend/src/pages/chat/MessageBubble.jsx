import { CHAT_REACTIONS } from '@app/shared';
import { memo, useRef, useState } from 'react';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { EmojiPicker } from '../../components/ui/EmojiPicker.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { cn } from '../../lib/cn.js';
import { MessageAttachments } from './Attachments.jsx';
import { LinkPreviewCard } from './LinkPreviewCard.jsx';
import { PollCard } from './PollCard.jsx';
import { RichText, firstUrl } from './RichText.jsx';
import { formatTime, nameOf } from './chatFormat.js';

const ActionButton = ({ label, icon, onClick, buttonRef }) => (
  <button ref={buttonRef} type="button" aria-label={label} title={label} onClick={onClick} className="grid size-7 place-items-center rounded-md text-placeholder outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
    <Icon name={icon} className="size-4" />
  </button>
);

/** Untitled UI "Message status": sent = one grey check, read = brand double check, failed = a red note. */
const Status = ({ read, pending, failed }) => (failed
  ? <span className="text-xs font-medium text-danger">Not sent</span>
  : <Icon name={read ? 'check-double' : 'check'} aria-label={pending ? 'Sending' : read ? 'Read' : 'Sent'} className={cn('size-4', read ? 'text-accent' : 'text-placeholder', pending && 'opacity-50')} />);

/**
 * One message in Untitled UI's message style: avatar + name/time header on the first message of a run, a neutral bordered bubble (grey for others, white for you),
 * reply quote with a brand rule, link card, attachments as cards / pictures with a caption / a voice-note player, reactions as pills under the bubble.
 */
function MessageBubbleImpl({ message, mine, people, group, firstOfRun, lastOfRun, peerRead, flipMenu, onReply, onReact, onEdit, onDelete, onForward, onPin, onRetry, onJumpTo, onOpenAttachment, onStar, onInfo, onHide, canDeleteOthers, myId, conversationId }) {
  const [picker, setPicker] = useState(false);
  const pickerButton = useRef(null);
  const deleted = Boolean(message.deletedAt);
  const sender = nameOf(people, message.senderId);
  const isPoll = message.kind === 'poll';
  const link = !deleted && message.body ? firstUrl(message.body) : null;
  const hasFiles = !deleted && message.attachments?.length > 0;
  // a message that is only files (no text, no quote) is drawn without a bubble — like Untitled's attachment / image / audio examples
  const bare = hasFiles && !message.body && !message.replyPreview && !message.forwarded && !isPoll;

  const content = (
    <>
      {message.forwarded && !deleted && <p className="mb-1.5 flex items-center gap-1 text-xs text-muted"><Icon name="forward" className="size-3" />Forwarded</p>}
      {message.replyPreview && !deleted && (
        <button type="button" onClick={() => onJumpTo(message.replyPreview.id)} className="mb-2 block w-full rounded-md border border-line border-l-2 border-l-accent bg-surface px-2.5 py-1.5 text-left">
          <span className="block text-xs font-semibold text-ink">{nameOf(people, message.replyPreview.senderId)}</span>
          <span className="line-clamp-2 text-sm text-muted">{message.replyPreview.deleted ? 'This message was deleted' : message.replyPreview.body}</span>
        </button>
      )}
      {hasFiles && !bare && <div className="mb-2"><MessageAttachments attachments={message.attachments} onOpen={onOpenAttachment} /></div>}
      {deleted ? <span className="italic text-muted">This message was deleted</span> : isPoll ? <PollCard message={message} conversationId={conversationId} /> : (
        <>
          {link && <LinkPreviewCard url={link} />}
          {message.body && <p className="whitespace-pre-wrap"><RichText text={message.body} mentions={message.mentions} people={people} myId={myId} /></p>}
        </>
      )}
    </>
  );

  return (
    <div className={cn('group/msg flex gap-3', mine && 'flex-row-reverse', firstOfRun ? 'mt-4' : 'mt-1')}>
      {!mine && (firstOfRun ? <Avatar name={sender} src={people[message.senderId]?.avatar} size="size-10" /> : <span className="size-10 shrink-0" aria-hidden="true" />)}
      <div className={cn('flex min-w-0 max-w-[min(34rem,84%)] flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
        {firstOfRun && (
          <div className={cn('flex min-w-44 items-center gap-3 text-sm', mine ? 'justify-end' : 'justify-between')}>
            <span className="font-medium text-ink">{mine ? 'You' : sender}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted"><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>{mine && !deleted && !group && <Status read={peerRead} pending={message.pending} failed={message.failed} />}</span>
          </div>
        )}
        <div className={cn('flex items-center gap-1', mine && 'flex-row-reverse')}>
          {bare ? <div className={cn('min-w-0', message.pending && 'opacity-70')}>{<MessageAttachments attachments={message.attachments} onOpen={onOpenAttachment} />}</div> : (
            <div
              className={cn('min-w-0 rounded-lg border px-3.5 py-2.5 text-[15px] leading-6 text-ink [overflow-wrap:anywhere]', mine ? 'border-line-strong bg-surface' : 'border-line bg-surface-2',
                !firstOfRun && (mine ? 'rounded-tr-sm' : 'rounded-tl-sm'), !lastOfRun && (mine ? 'rounded-br-sm' : 'rounded-bl-sm'), message.pending && 'opacity-70')}
              title={firstOfRun ? undefined : formatTime(message.createdAt)}
            >
              {content}
              {(message.starred || message.editedAt || message.expiresAt) && !deleted && (
                <span className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-muted">
                  {message.starred && <Icon name="star" className="size-3 fill-current" aria-label="Starred" />}
                  {message.expiresAt && <Icon name="timer" className="size-3" aria-label="Disappearing message" />}
                  {message.editedAt && <span>edited</span>}
                </span>
              )}
            </div>
          )}

          {!deleted && !message.pending && !message.failed && (
            <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
              <ActionButton label="React" icon="smile" buttonRef={pickerButton} onClick={() => setPicker((o) => !o)} />
              <ActionButton label="Reply" icon="reply" onClick={() => onReply(message)} />
              <DropdownMenu>
                <DropdownMenuTrigger>{(props) => <button {...props} type="button" aria-label="More actions" className="grid size-7 place-items-center rounded-md text-placeholder outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[open=true]:opacity-100"><Icon name="more-horizontal" className="size-4" /></button>}</DropdownMenuTrigger>
                <DropdownMenuContent side={flipMenu ? 'top' : 'bottom'} align={mine ? 'end' : 'start'} className="min-w-44">
                  {!isPoll && <DropdownMenuItem icon="copy" onSelect={() => navigator.clipboard?.writeText(message.body)}>Copy text</DropdownMenuItem>}
                  {!isPoll && <DropdownMenuItem icon="forward" onSelect={() => onForward(message)}>Forward</DropdownMenuItem>}
                  <DropdownMenuItem icon="star" onSelect={() => onStar(message)}>{message.starred ? 'Unstar' : 'Star'}</DropdownMenuItem>
                  {!isPoll && <DropdownMenuItem icon="pin" onSelect={() => onPin(message)}>Pin / unpin</DropdownMenuItem>}
                  {mine && <DropdownMenuItem icon="eye" onSelect={() => onInfo(message)}>Message info</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  {mine && !isPoll && <DropdownMenuItem icon="edit" onSelect={() => onEdit(message)}>Edit</DropdownMenuItem>}
                  <DropdownMenuItem icon="trash" onSelect={() => onHide(message)}>Delete for me</DropdownMenuItem>
                  {(mine || canDeleteOthers) && <DropdownMenuItem icon="trash" onSelect={() => onDelete(message)} className="text-danger">Delete for everyone</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {message.failed && <button type="button" onClick={() => onRetry(message)} className="text-xs font-semibold text-danger hover:underline">Tap to retry</button>}
        {message.reactions?.length > 0 && !deleted && (
          <ul className="flex flex-wrap gap-1" aria-label="Reactions">
            {message.reactions.map((r) => (
              <li key={r.emoji}>
                <button type="button" aria-pressed={r.mine} aria-label={`${r.emoji} ${r.count}`} onClick={() => onReact(message, r.emoji)} className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring', r.mine ? 'border-accent bg-accent-soft text-link' : 'border-line bg-surface text-ink hover:bg-surface-2')}>
                  <span>{r.emoji}</span>{r.count > 1 && <span className="text-xs font-semibold">{r.count}</span>}
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
