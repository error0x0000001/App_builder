import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { cn } from '../../../lib/cn.js';
import { conversationTitle } from '../chatFormat.js';
import { useConversation, useInbox, usePeople } from '../chatQueries.js';
import { Thread } from '../Thread.jsx';
import { PeoplePanel } from './PeoplePanel.jsx';

const formatElapsed = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Attaches a LiveKit track to a media element (and detaches it again) — video is muted for the local preview. */
function MediaTrack({ track, kind, muted = false, className }) {
  const element = useRef(null);
  useEffect(() => {
    const el = element.current;
    if (!track || !el) return undefined;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return kind === 'video' ? <video ref={element} autoPlay playsInline muted={muted} className={className} /> : <audio ref={element} autoPlay />;
}

function Tile({ participant, people, local, source }) {
  const { Track } = source;
  const camera = participant.getTrackPublication(Track.Source.Camera);
  const screen = participant.getTrackPublication(Track.Source.ScreenShare);
  const mic = participant.getTrackPublication(Track.Source.Microphone);
  const name = participant.name || people[participant.identity]?.name || 'Guest';
  const showVideo = camera?.track && !camera.isMuted;
  const micOn = Boolean(mic) && !mic.isMuted;
  return (
    <>
      <div className={cn('relative aspect-video min-h-0 overflow-hidden rounded-xl border bg-white/10', participant.isSpeaking ? 'border-accent ring-2 ring-accent' : 'border-white/15')} data-participant={participant.identity}>
        {showVideo ? <MediaTrack track={camera.track} kind="video" muted className={cn('size-full object-cover', local && '-scale-x-100')} /> : <div className="grid size-full place-items-center"><Avatar name={name} size="size-20" className="text-2xl" /></div>}
        {!local && mic?.track && <MediaTrack track={mic.track} kind="audio" />}
        <div className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
          {!micOn && <Icon name="mic-off" className="size-3.5 shrink-0 text-danger" aria-label="Muted" />}
          {!showVideo && <Icon name="video-off" className="size-3.5 shrink-0 text-white/70" aria-label="Camera off" />}
          <span className="truncate">{local ? 'You' : name}</span>
        </div>
      </div>
      {screen?.track && (
        <div className="relative aspect-video min-h-0 overflow-hidden rounded-xl border border-white/15 bg-black sm:col-span-2" data-screen={participant.identity}>
          <MediaTrack track={screen.track} kind="video" muted={local} className="size-full object-contain" />
          <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">{local ? 'Your screen' : `${name}'s screen`}</div>
        </div>
      )}
    </>
  );
}

const Control = ({ icon, label, on = true, danger = false, onClick }) => (
  <button
    type="button" aria-label={label} title={label} aria-pressed={danger ? undefined : on} onClick={onClick}
    className={cn('grid size-12 place-items-center rounded-full border outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring', danger ? 'border-transparent bg-danger text-white hover:opacity-90' : on ? 'border-white/20 bg-white/10 text-white hover:bg-white/20' : 'border-transparent bg-white text-black hover:bg-white/90')}
  >
    <Icon name={icon} className="size-5" />
  </button>
);

/** The call surface: a grid of participants, a timer, and mic / camera / screen-share / leave controls. Always dark, whatever the theme. */
export function CallScreen({ session, room, myId, onLeave, onEndForAll, onDismiss }) {
  const people = usePeople();
  const inbox = useInbox();
  const conversation = inbox.data?.conversations.find((c) => c.id === session.conversationId);
  const [source, setSource] = useState(null);
  const [panel, setPanel] = useState(null); // 'people' | 'chat' | null
  const detail = useConversation(session.conversationId).data?.conversation;
  const hostId = detail?.activeCall?.startedBy ?? session.startedBy;
  const isHost = hostId === myId || (detail?.kind === 'group' && detail?.role === 'admin');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { import('livekit-client').then((m) => setSource(m)); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (session.ended) {
    return (
      <div role="dialog" aria-label="Call ended" className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-6 text-white">
        <div className="w-full max-w-sm rounded-xl border border-white/15 bg-black p-6 text-center">
          <Icon name="phone-off" className="mx-auto size-8 text-white/70" />
          <p className="mt-3 text-sm font-semibold">{session.notice}</p>
          <Button className="mt-5" onClick={onDismiss}>Close</Button>
        </div>
      </div>
    );
  }

  const title = conversation ? conversationTitle(conversation, people) : 'Call';
  const lp = room?.localParticipant;
  const participants = room && source ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const cols = participants.length <= 1 ? 'sm:grid-cols-1 max-w-3xl' : participants.length <= 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';

  return (
    <div role="dialog" aria-label={`Call with ${title}`} className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/15 px-4">
        <Icon name={session.video ? 'video' : 'phone'} className="size-4 text-white/70" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
        {session.notice && <span className="text-xs text-white/70">{session.notice}</span>}
        <span className="text-xs tabular-nums text-white/70">{session.status === 'connected' ? formatElapsed(now - session.connectedAt) : 'Connecting…'}</span>
        <span className="rounded-md border border-white/20 px-2 py-0.5 text-xs">{participants.length || 1} in call</span>
      </header>
      {session.error && <p role="alert" className="border-b border-white/15 bg-white/10 px-4 py-2 text-center text-xs">{session.error}</p>}
      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          {session.status === 'connecting' || !source ? <div className="grid h-full place-items-center"><Spinner /></div> : (
            <div className={cn('mx-auto grid grid-cols-1 content-center gap-3', cols)}>
              {participants.map((p) => <Tile key={p.identity} participant={p} people={people} local={p.identity === myId} source={source} />)}
            </div>
          )}
        </main>
        {panel && source && (
          <aside aria-label={panel === 'people' ? 'People' : 'Chat'} className="absolute inset-y-14 right-0 bottom-[5.5rem] z-10 w-full max-w-sm border-l border-line bg-surface text-ink sm:static sm:w-96 sm:max-w-none">
            {panel === 'people'
              ? <PeoplePanel conversationId={session.conversationId} participants={participants} people={people} myId={myId} hostId={hostId} isHost={isHost} source={source} />
              : <Thread id={session.conversationId} embedded />}
          </aside>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-white/15 p-4">
        <Control icon={lp?.isMicrophoneEnabled ? 'mic' : 'mic-off'} label={lp?.isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'} on={Boolean(lp?.isMicrophoneEnabled)} onClick={() => lp?.setMicrophoneEnabled(!lp.isMicrophoneEnabled).catch(() => {})} />
        <Control icon="video" label={lp?.isCameraEnabled ? 'Turn camera off' : 'Turn camera on'} on={Boolean(lp?.isCameraEnabled)} onClick={() => lp?.setCameraEnabled(!lp.isCameraEnabled).catch(() => {})} />
        <Control icon="screen-share" label={lp?.isScreenShareEnabled ? 'Stop sharing' : 'Share screen'} on={!lp?.isScreenShareEnabled} onClick={() => lp?.setScreenShareEnabled(!lp.isScreenShareEnabled).catch(() => {})} />
        <Control icon="users" label="People" on={panel !== 'people'} onClick={() => setPanel((p) => (p === 'people' ? null : 'people'))} />
        <Control icon="chat" label="Chat" on={panel !== 'chat'} onClick={() => setPanel((p) => (p === 'chat' ? null : 'chat'))} />
        <Control icon="phone-off" label="Leave call" danger onClick={onLeave} />
        {isHost && <Button variant="neutral" size="sm" onClick={onEndForAll} className="border-white/20 bg-transparent text-white hover:bg-white/10">End for everyone</Button>}
      </footer>
    </div>
  );
}
