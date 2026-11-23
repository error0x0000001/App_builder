import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { ConversationInfo } from '../pages/chat/ConversationInfo.jsx';
import { ConversationList } from '../pages/chat/ConversationList.jsx';

/**
 * The chat section's panel (rail panel or classic sidebar): the inbox, which turns into the contact / group info when it is opened from the conversation
 * (`?info=1`) — with a Back control, not a third column. Drawn in the navigation colours.
 */
export function ChatPanel() {
  const navigate = useNavigate();
  const match = useMatch('/app/chat/:id');
  const [params, setParams] = useSearchParams();
  const id = match?.params.id;
  const info = id && params.get('info') === '1';
  return (
    <div className="on-sidebar flex min-h-0 flex-1 flex-col text-sidebar-ink">
      {info
        ? <ConversationInfo key={id} conversationId={id} onBack={() => { const next = new URLSearchParams(params); next.delete('info'); setParams(next, { replace: true }); }} />
        : <ConversationList activeId={id} onOpen={(conversationId) => navigate(`/app/chat/${conversationId}`)} />}
    </div>
  );
}
