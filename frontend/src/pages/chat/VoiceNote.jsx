import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { driveApi } from '../../api/endpoints.js';
import { cn } from '../../lib/cn.js';
import { Icon } from '../../components/ui/Icon.jsx';

const BARS = 30;
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** Stable pseudo-random bar heights from the file id: the same note always draws the same bars (the shape is decorative — it is not decoded from the audio). */
const heights = (seed) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return Array.from({ length: BARS }, () => { h = (h * 1664525 + 1013904223) >>> 0; return 18 + (h % 82); }); };

/** Untitled UI "Message audio": a round brand play button, a waveform that fills as it plays (click to seek), and the duration. A real <audio> element does the playing. */
export function VoiceNote({ file }) {
  const { data } = useQuery({ queryKey: ['drive', 'link', file.id], queryFn: () => driveApi.link(file.id), staleTime: 4 * 60_000 });
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const bars = useMemo(() => heights(file.id), [file.id]);
  useEffect(() => { setPlaying(false); setTime(0); }, [data?.url]);
  const toggle = () => { const el = audio.current; if (!el) return; if (el.paused) el.play().catch(() => {}); else el.pause(); };
  const seek = (event) => { const el = audio.current; if (!el || !length) return; const box = event.currentTarget.getBoundingClientRect(); el.currentTime = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * length; };
  const progress = length ? time / length : 0;
  return (
    <div className="flex w-72 max-w-full items-center gap-3 rounded-lg border border-line bg-surface px-2.5 py-2" role="group" aria-label={`Voice note ${file.name}`}>
      <button type="button" onClick={toggle} disabled={!data?.url} aria-label={playing ? 'Pause voice note' : 'Play voice note'} className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink outline-none hover:bg-accent-hover focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-60">
        <Icon name={playing ? 'pause' : 'play'} className={cn('size-4', !playing && 'translate-x-px fill-current')} />
      </button>
      <div role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(time)} tabIndex={0} onClick={seek}
        onKeyDown={(e) => { const el = audio.current; if (!el) return; if (e.key === 'ArrowRight') el.currentTime += 5; if (e.key === 'ArrowLeft') el.currentTime -= 5; }}
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {bars.map((h, i) => <span key={i} aria-hidden="true" style={{ height: `${h}%` }} className={cn('w-[3px] shrink-0 rounded-full', i / BARS < progress ? 'bg-accent' : 'bg-accent/30')} />)}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted">{clock(playing || time ? time : length)}</span>
      <audio ref={audio} src={data?.url} preload="metadata" className="hidden"
        onLoadedMetadata={(e) => setLength(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onDurationChange={(e) => setLength(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }} />
    </div>
  );
}
