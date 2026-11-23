import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { useRingtone } from './useRingtone.js';

/** The ringing card (top right, over everything): who is calling and whether it is a video call. */
export function IncomingCall({ call, onAccept, onDecline }) {
  useRingtone(Boolean(call));
  if (!call) return null;
  const group = call.kind === 'group';
  return (
    <div role="alertdialog" aria-label="Incoming call" className="fixed right-4 top-4 z-[90] w-80 rounded-xl border border-line-strong bg-surface p-4 text-ink">
      <div className="flex items-center gap-3">
        <Avatar name={call.from?.name ?? '?'} size="size-11" className="animate-pulse" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{group ? call.title : call.from?.name}</p>
          <p className="truncate text-xs text-muted">{group ? `${call.from?.name} is calling` : 'is calling you'} · {call.video ? 'Video' : 'Audio'} call</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="danger" size="sm" fullWidth onClick={onDecline}><Icon name="phone-off" className="size-4" />Decline</Button>
        <Button size="sm" fullWidth onClick={onAccept}><Icon name={call.video ? 'video' : 'phone'} className="size-4" />Accept</Button>
      </div>
    </div>
  );
}
