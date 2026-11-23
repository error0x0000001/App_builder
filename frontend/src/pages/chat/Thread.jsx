import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { chatApi, download } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { DropZone } from '../../components/ui/FilePicker.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { uuidv7 } from '../../lib/uuidv7.js';
import { ChatAvatar } from './ChatAvatar.jsx';
import { KEYS, dropMessage, patchInboxItem, patchMessage, upsertMessage } from './chatCache.js';
import { callText, conversationTitle, formatDayLabel, nameOf, sameDay, systemText } from './chatFormat.js';
import { useCall } from './calls/CallProvider.jsx';
import { messagesQueryOptions, useConversation, useInbox, usePeople } from './chatQueries.js';
import { useChatRealtime } from './ChatRealtime.jsx';
import { Composer } from './Composer.jsx';
import { PreviewDialog } from '../documents/PreviewDialog.jsx';
import { asDriveFile } from './Attachments.jsx';
import { ForwardDialog } from './ForwardDialog.jsx';
import { MessageBubble } from './MessageBubble.jsx';
import { usePresence } from './usePresence.js';

const RUN_GAP_MS = 5 * 60_000;
const NEAR_BOTTOM = 140;

/** One open conversation: header, the scrolling message list (older pages load as you scroll up) and the composer. */
export function Thread({ id, onBack, onInfo, embedded = false }) {
  const { user } = useAuth();
  const myId = user.id;
  const qc = useQueryClient();
  const people = usePeople();
  const { typingIn, sendTyping, setOpenConversation } = useChatRealtime();
  const calls = useCall();
  const inbox = useInbox();
  const detail = useConversation(id);
  const item = inbox.data?.conversations.find((c) => c.id === id);
  const conversation = detail.data?.conversation;
  const messagesQuery = useInfiniteQuery(messagesQueryOptions(qc, id));
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [preview, setPreview] = useState(null);
  const composer = useRef(null);
  const [unseen, setUnseen] = useState(0);
  const [actionError, setActionError] = useState(null);

  const scroller = useRef(null);
  const stick = useRef(true);
  const heightBefore = useRef(null);
  const initialRead = useRef(item?.lastReadId ?? null);
  const lastMarked = useRef(null);

  const messages = useMemo(() => (messagesQuery.data ? [...messagesQuery.data.pages].reverse().flatMap((p) => p.messages) : []), [messagesQuery.data]);
  const title = item ? conversationTitle(item, people) : conversation ? conversationTitle({ ...conversation, peerId: conversation.members.find((m) => m.userId !== myId)?.userId }, people) : '';
  const peerId = conversation?.kind === 'dm' ? conversation.members.find((m) => m.userId !== myId)?.userId : null;
  const peerReadId = conversation?.members.find((m) => m.userId === peerId)?.lastReadId ?? '';
  const online = usePresence(peerId ? [peerId] : []);
  const typers = typingIn(id).filter((u) => u !== myId);

  useEffect(() => { setOpenConversation(id); return () => setOpenConversation(null); }, [id, setOpenConversation]);

  // -- scroll behaviour: stay at the bottom while reading the newest, keep position when older pages are prepended
  const toBottom = useCallback((smooth = false) => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); setUnseen(0); stick.current = true; }, []);
  const lastCount = useRef(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !messages.length) return;
    if (heightBefore.current != null) { el.scrollTop += el.scrollHeight - heightBefore.current; heightBefore.current = null; }
    else if (lastCount.current === 0 || stick.current || messages[messages.length - 1].senderId === myId) toBottom();
    else if (messages.length > lastCount.current) setUnseen((n) => n + messages.length - lastCount.current);
    lastCount.current = messages.length;
  }, [messages, myId, toBottom]);

  const onScroll = () => {
    const el = scroller.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (stick.current) setUnseen(0);
    if (el.scrollTop < 240 && messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) { heightBefore.current = el.scrollHeight; messagesQuery.fetchNextPage(); }
  };

  // -- read cursor: whatever is on screen counts as read once the tab is visible
  const markRead = useCallback(() => {
    const last = messages[messages.length - 1];
    if (!last || last.pending || last.failed || document.visibilityState !== 'visible') return;
    if (lastMarked.current === last.id || last.id <= (item?.lastReadId ?? '')) return;
    lastMarked.current = last.id;
    patchInboxItem(qc, id, { unread: 0, lastReadId: last.id });
    chatApi.markRead(id, last.id).then(() => qc.invalidateQueries({ queryKey: KEYS.unread })).catch(() => { lastMarked.current = null; });
  }, [messages, item?.lastReadId, id, qc]);
  useEffect(() => {
    const timer = setTimeout(markRead, 250);
    window.addEventListener('focus', markRead); document.addEventListener('visibilitychange', markRead);
    return () => { clearTimeout(timer); window.removeEventListener('focus', markRead); document.removeEventListener('visibilitychange', markRead); };
  }, [markRead]);

  // -- actions
  const fail = (error) => setActionError(error.message ?? 'Something went wrong');
  const send = useCallback(async ({ body, replyTo: replyId, attachments = [] }) => {
    const messageId = uuidv7();
    const replied = replyId ? messages.find((m) => m.id === replyId) : null;
    upsertMessage(qc, {
      id: messageId, conversationId: id, senderId: myId, kind: 'text', body, replyTo: replyId ?? null, forwarded: false, attachments, mentions: [], editedAt: null, deletedAt: null,
      createdAt: new Date().toISOString(), reactions: [], pending: true,
      ...(replied ? { replyPreview: { id: replied.id, senderId: replied.senderId, body: replied.body.slice(0, 140), deleted: false } } : {}),
    });
    setReplyTo(null); stick.current = true;
    try { upsertMessage(qc, (await chatApi.send(id, { id: messageId, body, replyTo: replyId, attachments: attachments.map((a) => a.id) })).message); }
    catch { patchMessage(qc, id, messageId, { pending: false, failed: true }); }
  }, [qc, id, myId, messages]);
  const retry = (message) => { dropMessage(qc, id, message.id); send({ body: message.body, replyTo: message.replyTo, attachments: message.attachments }); };
  const saveEdit = async (message, body) => { setEditing(null); if (body !== message.body) await chatApi.edit(id, message.id, body).catch(fail); };
  const react = (message, emoji) => chatApi.react(id, message.id, emoji).catch(fail);
  const pin = (message) => chatApi.pin(id, message.id).catch(fail);
  const jumpTo = (messageId) => document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const canDeleteOthers = conversation?.kind === 'group' && conversation.role === 'admin';

  if (detail.isError) return <div className="grid h-full place-items-center p-6"><Alert tone="error">{detail.error.message}</Alert></div>;

  const allFiles = messages.flatMap((m) => (m.deletedAt ? [] : (m.attachments ?? []).map(asDriveFile)));
  let unreadMarked = false;
  const subtitle = typers.length ? `${typers.map((u) => nameOf(people, u).split(' ')[0]).join(', ')} typing…`
    : conversation?.kind === 'dm' ? (online.includes(peerId) ? 'Online' : 'Offline')
      : conversation ? `${conversation.members.length} members${conversation.meetingAt ? ' · Meeting' : ''}` : '';

  return (
    <DropZone onFiles={(files) => composer.current?.addFiles(files)} label="Drop files to send" className="h-full min-h-0">
    <section className="flex h-full min-h-0 flex-col" aria-label={`Conversation with ${title}`}>
      {!embedded && <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
        <Button size="icon" variant="ghost" aria-label="Back to conversations" onClick={onBack} className="md:hidden"><Icon name="chevron-left" className="size-4" /></Button>
        <button type="button" onClick={onInfo} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {(item || conversation) && <ChatAvatar conversation={item ?? { ...conversation, peerId }} people={people} online={online.includes(peerId)} />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{title}</span>
            <span className={`block truncate text-xs ${typers.length ? 'text-link' : 'text-muted'}`} aria-live="polite">{subtitle}</span>
          </span>
        </button>
        {conversation?.legalHold && <span className="hidden items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted sm:inline-flex"><Icon name="lock" className="size-3" />Legal hold</span>}
        {calls.enabled && (
          <>
            <Button size="icon" variant="ghost" aria-label="Start audio call" disabled={Boolean(calls.session)} onClick={() => calls.startCall(id, false)}><Icon name="phone" className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Start video call" disabled={Boolean(calls.session)} onClick={() => calls.startCall(id, true)}><Icon name="video" className="size-4" /></Button>
          </>
        )}
        <Button size="icon" variant="ghost" aria-label="Conversation details" onClick={onInfo}><Icon name="info" className="size-4" /></Button>
      </header>}
      {!embedded && calls.enabled && conversation?.activeCall && calls.session?.conversationId !== id && (
        <div role="status" className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2 text-sm">
          <Icon name={conversation.activeCall.video ? 'video' : 'phone'} className="size-4 text-link" />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{conversation.activeCall.video ? 'Video' : 'Audio'} call in progress</span>
          <Button size="sm" onClick={() => calls.joinCall(id, conversation.activeCall.video)}>Join</Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-3 sm:px-5" role="log" aria-live="polite" aria-label="Messages">
          {messagesQuery.isFetchingNextPage && <div className="flex justify-center py-2"><Spinner /></div>}
          {!messagesQuery.hasNextPage && messages.length > 0 && !messagesQuery.isPending && <p className="py-3 text-center text-xs text-muted">This is the start of the conversation</p>}
          {messagesQuery.isPending && <div className="flex justify-center py-10"><Spinner /></div>}
          {messagesQuery.isSuccess && messages.length === 0 && <div className="grid place-items-center py-16 text-center"><div><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full border border-line bg-surface-2"><Icon name="chat" className="size-6 text-muted" /></div><p className="text-sm font-semibold text-ink">Say hello</p><p className="mt-1 text-sm text-muted">Messages in this conversation will appear here.</p></div></div>}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            const firstOfRun = newDay || prev.kind === 'system' || prev.senderId !== m.senderId || new Date(m.createdAt) - new Date(prev.createdAt) > RUN_GAP_MS;
            const showUnread = !unreadMarked && m.kind === 'text' && m.senderId !== myId && initialRead.current != null ? m.id > initialRead.current : false;
            if (showUnread) unreadMarked = true;
            return (
              <div key={m.id} id={`msg-${m.id}`}>
                {newDay && <div className="my-3 flex justify-center"><span className="rounded-full border border-line bg-surface px-3 py-0.5 text-xs font-medium text-muted">{formatDayLabel(m.createdAt)}</span></div>}
                {showUnread && <div className="my-2 flex items-center gap-3 text-xs font-semibold text-link"><span className="h-px flex-1 bg-accent/40" />New messages<span className="h-px flex-1 bg-accent/40" /></div>}
                {m.kind === 'system' || m.kind === 'call'
                  ? <p className="my-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted">{m.kind === 'call' && <Icon name={m.body.endsWith('video') ? 'video' : 'phone'} className="size-3.5" />}{m.kind === 'call' ? callText(m, people, myId) : systemText(m, people, myId)}</p>
                  : (
                    <MessageBubble
                      message={m} mine={m.senderId === myId} people={people} group={conversation?.kind === 'group'} showSender={conversation?.kind === 'group'} firstOfRun={firstOfRun}
                      peerRead={Boolean(peerReadId) && peerReadId >= m.id} flipMenu={i >= messages.length - 3} canDeleteOthers={canDeleteOthers}
                      onReply={setReplyTo} onReact={react} onEdit={(msg) => { setReplyTo(null); setEditing(msg); }} onDelete={setDeleting} onForward={setForwarding} onPin={pin} onRetry={retry} onJumpTo={jumpTo} onOpenAttachment={setPreview}
                    />
                  )}
              </div>
            );
          })}
        </div>
        {unseen > 0 && <Button size="sm" onClick={() => toBottom(true)} className="absolute bottom-3 left-1/2 -translate-x-1/2"><Icon name="arrow-down" className="size-4" />{unseen} new {unseen === 1 ? 'message' : 'messages'}</Button>}
      </div>

      {actionError && <div className="px-3 pb-2"><Alert tone="error">{actionError} <button type="button" onClick={() => setActionError(null)} className="ml-2 font-semibold underline">Dismiss</button></Alert></div>}
      <Composer
        ref={composer} conversationId={id} replyTo={replyTo} editing={editing} people={people} myId={myId} disabled={!conversation && detail.isPending}
        onSend={send} onSaveEdit={saveEdit} onCancel={() => { setReplyTo(null); setEditing(null); }} onTyping={() => sendTyping(id)}
      />

      <ConfirmDialog
        open={Boolean(deleting)} title="Delete this message?" description="It will be removed for everyone in this conversation." confirmLabel="Delete" danger onClose={() => setDeleting(null)}
        onConfirm={async () => { await chatApi.remove(id, deleting.id).catch(fail); }}
      />
      <ForwardDialog message={forwarding} fromConversationId={id} onClose={() => setForwarding(null)} />
      <PreviewDialog file={preview} files={allFiles} onClose={() => setPreview(null)} onNavigate={setPreview} onDownload={(f) => download(`/drive/files/${f.id}/download`, f.name)} />
    </section>
    </DropZone>
  );
}
