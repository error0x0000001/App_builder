import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { chatApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { RealtimeClient } from '../../lib/realtime.js';
import { KEYS, applyReaction, mergePeople, patchInboxItem, sortInbox, upsertMessage, patchMessage } from './chatCache.js';

const TYPING_MS = 4000;
const Context = createContext({ status: 'offline', typingIn: () => [], sendTyping: () => {}, setOpenConversation: () => {}, subscribe: () => () => {} });
export const useChatRealtime = () => useContext(Context);

/** Unread messages across all conversations (the number on the Chat navigation item). */
export function useChatUnread() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: KEYS.unread, queryFn: chatApi.unread, enabled: Boolean(user), staleTime: 60_000 });
  return data?.unread ?? 0;
}

/**
 * Keeps the chat caches live. One socket per tab turns server events into cache edits (so open threads, the inbox and the unread badge
 * update without refetching), tracks who is typing, and refetches everything after a reconnect.
 */
export function ChatRealtimeProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('offline');
  const [typing, setTyping] = useState({}); // conversationId -> { userId: expiresAt }
  const client = useRef(null);
  const open = useRef(null); // the conversation on screen: its new messages are read immediately
  const listeners = useRef(new Set()); // other features (calls) that want the raw event stream
  const myId = user?.id;

  const handle = useCallback((event) => {
    listeners.current.forEach((fn) => fn(event));
    switch (event.type) {
      case 'message.new': {
        if (event.sender) mergePeople(qc, { [event.sender.id]: event.sender });
        upsertMessage(qc, event.message);
        const mine = event.message.senderId === myId;
        const visible = open.current === event.conversationId && document.visibilityState === 'visible';
        qc.setQueryData(KEYS.inbox, (old) => {
          if (!old) return old;
          if (!old.conversations.some((c) => c.id === event.conversationId)) return old; // unknown conversation: refetched below
          const next = old.conversations.map((c) => (c.id === event.conversationId
            ? { ...c, last: { id: event.message.id, at: event.message.createdAt, senderId: event.message.senderId, kind: event.message.kind, deleted: false, body: event.message.body.slice(0, 140) }, unread: mine || visible || event.message.kind !== 'text' ? c.unread : Math.min(100, c.unread + 1) }
            : c));
          return { ...old, conversations: sortInbox(next) };
        });
        if (!qc.getQueryData(KEYS.inbox)?.conversations.some((c) => c.id === event.conversationId)) qc.invalidateQueries({ queryKey: KEYS.inbox });
        if (!mine && event.message.kind === 'text') qc.invalidateQueries({ queryKey: KEYS.unread });
        setTyping((t) => { const { [event.message.senderId]: _gone, ...rest } = t[event.conversationId] ?? {}; return { ...t, [event.conversationId]: rest }; });
        break;
      }
      case 'message.updated':
        patchMessage(qc, event.conversationId, event.message.id, event.message);
        qc.invalidateQueries({ queryKey: KEYS.inbox });
        break;
      case 'reaction': applyReaction(qc, event, myId); break;
      case 'read':
        qc.invalidateQueries({ queryKey: KEYS.conversation(event.conversationId) });
        if (event.userId === myId) { patchInboxItem(qc, event.conversationId, { unread: 0, lastReadId: event.lastReadId }); qc.invalidateQueries({ queryKey: KEYS.unread }); }
        break;
      case 'typing':
        setTyping((t) => ({ ...t, [event.conversationId]: { ...t[event.conversationId], [event.userId]: Date.now() + TYPING_MS } }));
        break;
      case 'conversation.joined': case 'conversation.left': case 'conversation.state': case 'conversation.updated':
        qc.invalidateQueries({ queryKey: KEYS.inbox });
        qc.invalidateQueries({ queryKey: KEYS.conversation(event.conversationId) });
        qc.invalidateQueries({ queryKey: KEYS.unread });
        break;
      case 'call.started': case 'call.ended':
        qc.invalidateQueries({ queryKey: KEYS.conversation(event.conversationId) });
        qc.invalidateQueries({ queryKey: KEYS.inbox });
        break;
      case 'pins.changed': qc.invalidateQueries({ queryKey: ['chat', 'pins', event.conversationId] }); break;
      default: break;
    }
  }, [qc, myId]);

  useEffect(() => {
    if (!myId) return undefined;
    const resync = () => qc.invalidateQueries({ queryKey: ['chat'] }); // anything missed while offline
    client.current = new RealtimeClient({ onEvent: handle, onStatus: setStatus, onResync: resync });
    client.current.start();
    return () => { client.current?.stop(); client.current = null; };
  }, [myId, handle, qc]);

  useEffect(() => { // typing indicators expire on their own
    const timer = setInterval(() => setTyping((t) => {
      const now = Date.now();
      let changed = false;
      const next = Object.fromEntries(Object.entries(t).map(([c, users]) => [c, Object.fromEntries(Object.entries(users).filter(([, until]) => { if (until <= now) changed = true; return until > now; }))]));
      return changed ? next : t;
    }), 1000);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo(() => ({
    status,
    typingIn: (conversationId) => Object.keys(typing[conversationId] ?? {}),
    sendTyping: (conversationId) => client.current?.send({ type: 'typing', conversationId }),
    setOpenConversation: (id) => { open.current = id; },
    subscribe: (fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); },
  }), [status, typing]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
