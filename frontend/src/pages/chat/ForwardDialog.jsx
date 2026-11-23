import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { ChatAvatar } from './ChatAvatar.jsx';
import { conversationTitle } from './chatFormat.js';
import { useInbox, usePeople } from './chatQueries.js';

/** Pick a conversation to forward a message into (the original stays where it is, marked "Forwarded" in the new place). */
export function ForwardDialog({ message, fromConversationId, onClose }) {
  const people = usePeople();
  const inbox = useInbox({ enabled: Boolean(message) });
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const list = useMemo(() => (inbox.data?.conversations ?? []).filter((c) => conversationTitle(c, people).toLowerCase().includes(search.trim().toLowerCase())), [inbox.data, people, search]);
  if (!message) return null;

  const forward = async (conversation) => {
    try {
      await chatApi.send(conversation.id, { forwardOf: { conversationId: fromConversationId, messageId: message.id } });
      onClose();
      navigate(`/app/chat/${conversation.id}`);
    } catch (e) { setError(e.message); }
  };

  return (
    <Dialog open onClose={onClose} label="Forward message" className="max-w-md">
      <div className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-ink">Forward to</h2>
        <p className="line-clamp-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">{message.body}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <SearchInput label="Search conversations" placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} autoFocus className="h-10 w-full" />
        <ul className="max-h-72 overflow-y-auto" aria-label="Conversations">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => forward(c)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                <ChatAvatar conversation={c} people={people} size="size-9" /><span className="truncate text-sm font-medium text-ink">{conversationTitle(c, people)}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">No conversations found</li>}
        </ul>
      </div>
    </Dialog>
  );
}
