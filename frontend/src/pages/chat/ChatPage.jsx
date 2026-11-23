import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { useChatRealtime } from './ChatRealtime.jsx';
import { ConversationList } from './ConversationList.jsx';
import { NewChatDialog } from './NewChatDialog.jsx';
import { ConversationInfo } from './ConversationInfo.jsx';
import { Thread } from './Thread.jsx';

/** Chat: the inbox on the left, the open conversation on the right (phones show one at a time). The live connection is mounted app-wide. */
export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { status } = useChatRealtime();
  const [creating, setCreating] = useState(null);
  const [info, setInfo] = useState(false);
  const open = (conversationId) => navigate(`/app/chat/${conversationId}`);

  useEffect(() => { setInfo(false); }, [id]);
  useEffect(() => { qc.invalidateQueries({ queryKey: ['chat', 'inbox'] }); }, [qc]); // a fresh inbox whenever the page opens

  return (
    <div className="flex h-full min-h-0">
      <aside className={cn('min-h-0 w-full shrink-0 border-r border-line md:block md:w-80 lg:w-96', id && 'hidden')} aria-label="Conversations">
        <ConversationList activeId={id} onOpen={open} onNew={setCreating} />
      </aside>
      <div className={cn('min-h-0 min-w-0 flex-1', !id && 'hidden md:block')}>
        {status === 'offline' && <p role="status" className="border-b border-line bg-surface-2 px-4 py-1.5 text-center text-xs font-medium text-muted">Reconnecting… new messages will appear when you are back online.</p>}
        {id ? <Thread key={id} id={id} onBack={() => navigate('/app/chat')} onInfo={() => setInfo((open) => !open)} /> : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-line bg-surface-2"><Icon name="chat" className="size-7 text-muted" /></div>
              <h2 className="text-base font-semibold text-ink">Your messages</h2>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Pick a conversation, or start a new one with a colleague or a group.</p>
              <Button className="mt-4" onClick={() => setCreating('dm')}><Icon name="plus" className="size-4" />New message</Button>
            </div>
          </div>
        )}
      </div>
      {id && info && <aside className="fixed inset-0 z-[60] min-h-0 border-l border-line lg:static lg:z-auto lg:w-96 lg:shrink-0" aria-label="Details"><ConversationInfo key={id} conversationId={id} onClose={() => setInfo(false)} /></aside>}
      <NewChatDialog mode={creating} onClose={() => setCreating(null)} onOpen={open} />
    </div>
  );
}
