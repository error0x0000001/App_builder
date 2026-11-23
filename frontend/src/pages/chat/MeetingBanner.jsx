import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { downloadIcs, formatMeeting, meetingPhase } from '../../lib/meetingTime.js';
import { useCall } from './calls/CallProvider.jsx';

/** The bar above a meeting's messages: when it is, "Add to calendar" before it starts, and Join from 15 minutes before (starts the call or joins the running one). */
export function MeetingBanner({ conversation, title }) {
  const calls = useCall();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const phase = meetingPhase(conversation.meetingAt, now);
  const joined = calls.session?.conversationId === conversation.id;
  const url = `${location.origin}/app/chat/${conversation.id}`;
  if (phase === 'over' && !conversation.activeCall) return <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 text-sm text-muted"><Icon name="calendar" className="size-4" />Meeting was on {formatMeeting(conversation.meetingAt)}</div>;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2 text-sm">
      <Icon name="calendar" className="size-4 text-link" />
      <span className="min-w-0 flex-1 font-medium text-ink">{phase === 'upcoming' ? `Meeting · ${formatMeeting(conversation.meetingAt)}` : conversation.activeCall ? 'Meeting in progress' : 'Meeting starts now'}</span>
      {phase === 'upcoming' && <Button size="sm" variant="neutral" onClick={() => downloadIcs({ id: conversation.id, title, iso: conversation.meetingAt, url })}><Icon name="calendar-plus" className="size-4" />Add to calendar</Button>}
      {calls.enabled && phase !== 'upcoming' && !joined && <Button size="sm" onClick={() => (conversation.activeCall ? calls.joinCall(conversation.id, conversation.activeCall.video) : calls.startCall(conversation.id, true))}><Icon name="video" className="size-4" />{conversation.activeCall ? 'Join' : 'Start meeting'}</Button>}
    </div>
  );
}
