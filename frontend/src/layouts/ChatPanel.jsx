import { useMatch, useNavigate } from 'react-router-dom';
import { ConversationList } from '../pages/chat/ConversationList.jsx';

/** The chat section's panel (rail panel or classic sidebar): the inbox, in the navigation colours. The contact / group info is NOT here — it is a detail panel and always opens on the right of the conversation. */
export function ChatPanel() {
  const navigate = useNavigate();
  const id = useMatch('/app/chat/:id')?.params.id;
  return <div className="on-sidebar flex min-h-0 flex-1 flex-col text-sidebar-ink"><ConversationList activeId={id} onOpen={(conversationId) => navigate(`/app/chat/${conversationId}`)} /></div>;
}
