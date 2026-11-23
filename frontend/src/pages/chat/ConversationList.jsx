import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { chatApi } from '../../api/endpoints.js';
import { Button } from '../../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { cn } from '../../lib/cn.js';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { ChatAvatar } from './ChatAvatar.jsx';
import { NewChatDialog } from './NewChatDialog.jsx';
import { conversationTitle, formatInboxTime, nameOf, previewText } from './chatFormat.js';
import { useInbox, usePeople } from './chatQueries.js';
import { usePresence } from './usePresence.js';

const TABS = [{ id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'groups', label: 'Groups' }];

function Row({ conversation, people, selected, online, myId, onOpen }) {
  const title = conversationTitle(conversation, people);
  const muted = conversation.mutedUntil && new Date(conversation.mutedUntil) > new Date();
  return (
    <li>
      <button
        type="button" onClick={() => onOpen(conversation.id)} aria-current={selected ? 'true' : undefined}
        className={cn('flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left outline-none transition-colors focus-visible:bg-surface-2', selected ? 'border-accent bg-surface-2' : 'border-transparent hover:bg-surface-2')}
      >
        <ChatAvatar conversation={conversation} people={people} online={online} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', conversation.unread ? 'font-semibold text-ink' : 'font-medium text-ink')}>{title}</span>
            <time className="shrink-0 text-xs text-muted">{formatInboxTime(conversation.last?.at)}</time>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', conversation.unread ? 'text-ink' : 'text-muted')}>{previewText(conversation, people, myId)}</span>
            {conversation.pinned && <Icon name="pin" className="size-3.5 shrink-0 text-muted" aria-label="Pinned" />}
            {muted && <Icon name="bell-off" className="size-3.5 shrink-0 text-muted" aria-label="Muted" />}
            {conversation.unread > 0 && <span className={cn('grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs font-semibold', muted ? 'bg-line-strong text-ink' : 'bg-accent text-accent-ink')} aria-label={`${conversation.unread} unread`}>{conversation.unread > 99 ? '99+' : conversation.unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The inbox: filter by tab, find a conversation by name, or search message text across everything you can see. */
export function ConversationList({ activeId, onOpen }) {
  const [creating, setCreating] = useState(null);
  const onNew = setCreating;
  const { user } = useAuth();
  const people = usePeople();
  const inbox = useInbox();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 250);
  const messages = useQuery({ queryKey: ['chat', 'search', q], queryFn: () => chatApi.search(q), enabled: q.length >= 2, staleTime: 20_000 });

  const all = inbox.data?.conversations ?? [];
  const visible = useMemo(() => {
    const needle = q.toLowerCase();
    return all.filter((c) => (tab === 'unread' ? c.unread > 0 : tab === 'groups' ? c.kind === 'group' : true) && (!needle || conversationTitle(c, people).toLowerCase().includes(needle)));
  }, [all, tab, q, people]);
  const online = usePresence(all.filter((c) => c.kind === 'dm').map((c) => c.peerId).filter(Boolean));
  const unreadTotal = all.reduce((n, c) => n + (c.unread ? 1 : 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <SearchInput label="Search chats and messages" placeholder="Search chats and messages" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} className="h-10 min-w-0 flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger>{(props) => <Button {...props} size="icon" className="size-10" aria-label="New chat"><Icon name="plus" className="size-5" /></Button>}</DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem icon="chat" onSelect={() => onNew('dm')}>New message</DropdownMenuItem>
              <DropdownMenuItem icon="users" onSelect={() => onNew('group')}>New group</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Tabs label="Filter conversations" value={tab} onChange={setTab} tabs={TABS.map((t) => (t.id === 'unread' && unreadTotal ? { ...t, label: `Unread (${unreadTotal})` } : t))} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {inbox.isPending && <div className="flex justify-center py-10"><Spinner /></div>}
        {inbox.isError && <p className="p-4 text-sm text-danger">{inbox.error.message}</p>}
        <ul aria-label="Conversations">
          {visible.map((c) => <Row key={c.id} conversation={c} people={people} selected={c.id === activeId} online={c.kind === 'dm' && online.includes(c.peerId)} myId={user.id} onOpen={onOpen} />)}
        </ul>
        {inbox.isSuccess && visible.length === 0 && !q && (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full border border-line bg-surface-2"><Icon name="chat" className="size-6 text-muted" /></div>
            <p className="text-sm font-semibold text-ink">{tab === 'unread' ? 'You are all caught up' : 'No conversations yet'}</p>
            <p className="mt-1 text-sm text-muted">{tab === 'all' ? 'Start a message or create a group.' : 'Nothing to show here.'}</p>
            {tab === 'all' && <Button size="sm" className="mt-4" onClick={() => onNew('dm')}>New message</Button>}
          </div>
        )}

        {q.length >= 2 && (
          <section aria-label="Message results" className="border-t border-line">
            <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Messages</h3>
            {messages.isPending && <div className="flex justify-center py-4"><Spinner /></div>}
            {messages.data?.results.length === 0 && <p className="px-3 pb-4 text-sm text-muted">No messages match “{q}”.</p>}
            <ul>
              {messages.data?.results.map((r) => {
                const where = r.kind === 'dm' ? nameOf({ ...people, ...messages.data.people }, r.peerId) : r.title;
                return (
                  <li key={r.messageId}>
                    <button type="button" onClick={() => onOpen(r.conversationId, r.messageId)} className="block w-full px-3 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                      <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{where}</span><time className="shrink-0 text-xs text-muted">{formatInboxTime(r.createdAt)}</time></span>
                      <span className="line-clamp-2 text-sm text-muted"><span className="font-medium">{nameOf({ ...people, ...messages.data.people }, r.senderId).split(' ')[0]}:</span> {r.body}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      <NewChatDialog mode={creating} onClose={() => setCreating(null)} onOpen={onOpen} />
    </div>
  );
}
