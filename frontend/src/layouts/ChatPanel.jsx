import { useMatch, useNavigate } from 'react-router-dom';
import { ConversationList } from '../pages/chat/ConversationList.jsx';

/** The chat inbox as a navigation panel (rail panel or classic sidebar): same list as the page used to carry, drawn in the navigation colours. */
export function ChatPanel() {
  const navigate = useNavigate();
  const match = useMatch('/app/chat/:id');
  return <div className="on-sidebar -mx-5 min-h-0 flex-1 text-sidebar-ink"><ConversationList activeId={match?.params.id} onOpen={(id) => navigate(`/app/chat/${id}`)} /></div>;
}
