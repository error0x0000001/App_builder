import { chatApi } from '../../../api/endpoints.js';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { cn } from '../../../lib/cn.js';

/** Three bars that move while someone speaks. */
const SpeakingBars = () => (
  <span className="flex h-4 items-end gap-0.5" aria-label="Speaking" role="img">
    {[0, 150, 300].map((delay) => <span key={delay} className="w-0.5 animate-pulse rounded-full bg-success" style={{ height: `${60 + delay / 6}%`, animationDelay: `${delay}ms` }} />)}
  </span>
);

/**
 * Everyone in the call: profile, host badge, who is speaking, whether their microphone / camera / screen is on. The host (the person who started
 * the call, or a group admin) can mute one person, mute everyone, or remove someone — the server enforces it, this only shows the buttons.
 */
export function PeoplePanel({ conversationId, participants, people, myId, hostId, isHost, source }) {
  const { Track } = source;
  const act = (body) => chatApi.moderateCall(conversationId, body).catch(() => {});
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">People ({participants.length})</h3>
        {isHost && participants.length > 1 && <Button size="sm" variant="neutral" onClick={() => act({ action: 'mute-all' })}><Icon name="mic-off" className="size-4" />Mute all</Button>}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" aria-label="People in this call">
        {[...participants].sort((a, b) => Number(b.attributes?.hand === '1') - Number(a.attributes?.hand === '1')).map((p) => {
          const name = p.name || people[p.identity]?.name || 'Guest';
          const mic = p.getTrackPublication(Track.Source.Microphone);
          const camera = p.getTrackPublication(Track.Source.Camera);
          const sharing = Boolean(p.getTrackPublication(Track.Source.ScreenShare));
          const micOn = Boolean(mic) && !mic.isMuted;
          const camOn = Boolean(camera) && !camera.isMuted;
          const me = p.identity === myId;
          const hand = p.attributes?.hand === '1';
          return (
            <li key={p.identity} className={cn('flex items-center gap-3 px-4 py-2.5', p.isSpeaking && 'bg-success/10')} data-person={p.identity}>
              <Avatar name={name} src={people[p.identity]?.avatar} size="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{name}{me && ' (you)'}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {p.identity === hostId && <span className="rounded border border-line px-1 font-medium">Host</span>}
                  {p.isSpeaking ? 'Speaking' : micOn ? 'Mic on' : 'Muted'}
                </span>
              </span>
              {p.isSpeaking && <SpeakingBars />}
              {hand && <Icon name="hand" className="size-4 text-warning" aria-label="Hand raised" />}
              {sharing && <Icon name="screen-share" className="size-4 text-link" aria-label="Sharing screen" />}
              <Icon name={camOn ? 'video' : 'video-off'} className={cn('size-4', camOn ? 'text-ink' : 'text-muted')} aria-label={camOn ? 'Camera on' : 'Camera off'} />
              <Icon name={micOn ? 'mic' : 'mic-off'} className={cn('size-4', micOn ? 'text-ink' : 'text-danger')} aria-label={micOn ? 'Microphone on' : 'Microphone muted'} />
              {isHost && !me && (
                <DropdownMenu>
                  <DropdownMenuTrigger>{(props) => <Button {...props} size="icon" variant="ghost" aria-label={`Manage ${name}`}><Icon name="more-horizontal" className="size-4" /></Button>}</DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    {hand && <DropdownMenuItem icon="hand" onSelect={() => act({ action: 'lower-hand', userId: p.identity })}>Lower hand</DropdownMenuItem>}
                    <DropdownMenuItem icon="mic-off" onSelect={() => act({ action: 'mute', userId: p.identity })}>Mute</DropdownMenuItem>
                    <DropdownMenuItem icon="phone-off" className="text-danger" onSelect={() => act({ action: 'remove', userId: p.identity })}>Remove from call</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
