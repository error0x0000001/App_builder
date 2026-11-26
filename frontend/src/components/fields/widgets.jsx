import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { DropZone, useFilePicker } from '../ui/FilePicker.jsx';
import { FormField } from '../ui/FormField.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Input } from '../ui/Input.jsx';
import { Switch } from '../ui/Switch.jsx';
import { cn } from '../../lib/cn.js';

/**
 * Small controls that have no equivalent in the UI kit. They render and report changes — nothing else. Rules, validation and
 * limits come from the server; these only receive `disabled`, bounds to display and callbacks.
 */

/** Rating: a row of icon buttons. */
export function Rating({ value, onChange, scale = 5, icon = 'star', disabled, label }) {
  const current = Number(value) || 0;
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={current === n} aria-label={`${n}`} disabled={disabled} onClick={() => onChange?.(current === n ? 0 : n)} className="rounded p-0.5 text-line-strong outline-none transition-colors hover:text-warning focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
          <Icon name={icon === 'heart' ? 'smile' : 'star'} className={cn('size-6', n <= current && 'fill-current text-warning')} />
        </button>
      ))}
    </div>
  );
}

/** Slider: our own track and thumb (keyboard: arrows, Home, End). Values are strings, like every number in the product. */
export function Slider({ value, onChange, min = '0', max = '100', step = '1', unit, disabled, label }) {
  const lo = Number(min); const hi = Number(max); const st = Number(step) || 1;
  const current = value === '' || value === null || value === undefined ? lo : Number(value);
  const track = useRef(null);
  const pct = hi > lo ? ((current - lo) / (hi - lo)) * 100 : 0;
  const set = (n) => onChange?.(String(Math.min(hi, Math.max(lo, Math.round((n - lo) / st) * st + lo))));
  const fromPointer = (e) => { const r = track.current.getBoundingClientRect(); set(lo + ((e.clientX - r.left) / r.width) * (hi - lo)); };
  return (
    <div className="flex items-center gap-3">
      <div ref={track} className={cn('relative h-5 flex-1 touch-none', disabled && 'opacity-60')} onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }} onPointerMove={(e) => { if (e.buttons && !disabled) fromPointer(e); }}>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line-strong"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
        <div role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={current} aria-disabled={disabled || undefined}
          onKeyDown={(e) => { const d = { ArrowRight: st, ArrowUp: st, ArrowLeft: -st, ArrowDown: -st }[e.key]; if (d) { e.preventDefault(); set(current + d); } if (e.key === 'Home') set(lo); if (e.key === 'End') set(hi); }}
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface shadow outline-none focus-visible:ring-4 focus-visible:ring-ring" style={{ left: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-sm tabular-nums text-ink">{current}{unit ? ` ${unit}` : ''}</span>
    </div>
  );
}

/** Rich text: a toolbar over an editable area. It reports HTML; the server sanitises it. */
export function RichTextEditor({ value, onChange, formats = [], disabled, label, invalid }) {
  const ref = useRef(null);
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => { if (ref.current && ref.current.innerHTML !== (value ?? '')) ref.current.innerHTML = value ?? ''; }, [value]);
  const run = (command, arg) => { ref.current?.focus(); document.execCommand(command, false, arg); onChange?.(ref.current.innerHTML); };
  const tools = [['bold', 'bold', 'bold'], ['italic', 'italic', 'italic'], ['underline', 'underline', 'underline'], ['list', 'insertUnorderedList', 'list']].filter(([id]) => formats.includes(id));
  return (
    <div className={cn('overflow-hidden rounded-(--ctl-r) border bg-surface focus-within:border-accent focus-within:ring-4 focus-within:ring-ring', invalid ? 'border-danger' : 'border-line-strong', disabled && 'opacity-60')}>
      <div className="flex items-center gap-1 border-b border-line bg-surface-2 px-2 py-1">
        {tools.map(([id, cmd, icon]) => <Button key={id} size="icon" variant="ghost" aria-label={id} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)} className="size-7"><Icon name={icon} className="size-4" /></Button>)}
        {formats.includes('link') && <Button size="icon" variant="ghost" aria-label="Link" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => setLinking((v) => !v)} className="size-7"><Icon name="link" className="size-4" /></Button>}
      </div>
      {linking && (
        <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
          <Input aria-label="Link address" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
          <Button size="sm" onClick={() => { if (url) run('createLink', url); setUrl(''); setLinking(false); }}>Add link</Button>
        </div>
      )}
      <div ref={ref} role="textbox" aria-multiline="true" aria-label={label} contentEditable={!disabled} suppressContentEditableWarning onInput={() => onChange?.(ref.current.innerHTML)} className="min-h-28 px-3.5 py-2 text-sm text-ink outline-none [&_a]:text-link [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5" />
    </div>
  );
}

/** Signature pad: draw with a pointer; reports a small file description (the image itself is stored with the record). */
export function SignaturePad({ value, onChange, disabled }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const point = (e) => { const r = canvas.current.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.current.width / r.width), (e.clientY - r.top) * (canvas.current.height / r.height)]; };
  const finish = () => { drawing.current = false; const url = canvas.current.toDataURL('image/png'); onChange?.([{ name: 'signature.png', mime: 'image/png', size: Math.round(url.length * 0.75) }]); };
  return (
    <div className="space-y-2">
      <canvas ref={canvas} width={600} height={180} aria-label="Signature" className={cn('h-36 w-full touch-none rounded-(--ctl-r) border border-line-strong bg-surface', disabled && 'opacity-60')}
        onPointerDown={(e) => { if (disabled) return; drawing.current = true; canvas.current.setPointerCapture(e.pointerId); const ctx = canvas.current.getContext('2d'); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = getComputedStyle(canvas.current).color; ctx.beginPath(); ctx.moveTo(...point(e)); }}
        onPointerMove={(e) => { if (!drawing.current) return; const ctx = canvas.current.getContext('2d'); ctx.lineTo(...point(e)); ctx.stroke(); }} onPointerUp={finish} />
      <Button size="sm" variant="neutral" disabled={disabled || !value?.length} onClick={() => { canvas.current.getContext('2d').clearRect(0, 0, 600, 180); onChange?.([]); }}>Clear</Button>
    </div>
  );
}

/** Files: pick or drop; reports the file descriptions (name, type, size). The bytes are uploaded to Documents when the record is saved. */
export function UploadField({ value, onChange, multiple, accept, disabled, label }) {
  const files = Array.isArray(value) ? value : [];
  const add = (list) => { const meta = [...list].map((f) => ({ name: f.name, mime: f.type, size: f.size })); onChange?.(multiple ? [...files, ...meta] : meta.slice(0, 1)); };
  const { open, input } = useFilePicker({ multiple, accept, onPick: add });
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div className="space-y-2">
      <DropZone onFiles={add} disabled={disabled} label="Drop files here">
        <button type="button" disabled={disabled} onClick={open} aria-label={label ?? 'Choose files'} className="flex w-full flex-col items-center gap-1 rounded-(--ctl-r) border border-dashed border-line-strong px-4 py-5 text-sm text-muted outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-60">
          <span className="grid size-9 place-items-center rounded-full border border-line-strong"><Icon name="upload" className="size-4" /></span>
          <span><span className="font-semibold text-link">Click to upload</span> or drag and drop</span>
        </button>
      </DropZone>
      {input}
      {files.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 bg-surface px-3 py-2 text-sm">
              <Icon name="paperclip" className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate text-ink">{f.name}</span><span className="text-xs text-muted">{size(f.size ?? 0)}</span>
              <Button size="icon" variant="ghost" aria-label={`Remove ${f.name}`} disabled={disabled} onClick={() => onChange?.(files.filter((_, j) => j !== i))}><Icon name="x" className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Checklist: items with a done switch. */
export function Checklist({ value, onChange, disabled, allowReorder = true, showProgress = true }) {
  const items = Array.isArray(value) ? value : [];
  const set = (next) => onChange?.(next);
  const done = items.filter((i) => i.done).length;
  const move = (i, d) => { const next = [...items]; [next[i], next[i + d]] = [next[i + d], next[i]]; set(next); };
  return (
    <div className="space-y-2">
      {showProgress && items.length > 0 && <p className="text-xs text-muted">{done} of {items.length} done</p>}
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Switch aria-label={`Done: ${item.text}`} checked={item.done} disabled={disabled} onChange={(e) => set(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} label="" />
          <Input aria-label={`Item ${i + 1}`} value={item.text} disabled={disabled} onChange={(e) => set(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="flex-1" />
          {allowReorder && <><Button size="icon" variant="ghost" aria-label="Move up" disabled={disabled || i === 0} onClick={() => move(i, -1)}><Icon name="chevron-up" className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Move down" disabled={disabled || i === items.length - 1} onClick={() => move(i, 1)}><Icon name="chevron-down" className="size-4" /></Button></>}
          <Button size="icon" variant="ghost" aria-label="Remove item" disabled={disabled} onClick={() => set(items.filter((_, j) => j !== i))}><Icon name="x" className="size-4" /></Button>
        </div>
      ))}
      <Button size="sm" variant="neutral" disabled={disabled} onClick={() => set([...items, { text: '', done: false }])}><Icon name="plus" />Add item</Button>
    </div>
  );
}

/** Timer: start / stop, with the entries listed. The server decides what is allowed; this reports entries. */
export function TimerField({ value, onChange, disabled, allowManual = true }) {
  const entries = Array.isArray(value) ? value : [];
  const running = entries.find((e) => !e.stoppedAt);
  const [, tick] = useState(0);
  useEffect(() => { if (!running) return undefined; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [running]);
  const secs = (e) => Math.max(0, Math.round(((e.stoppedAt ? Date.parse(e.stoppedAt) : Date.now()) - Date.parse(e.startedAt)) / 1000));
  const total = useMemo(() => entries.reduce((n, e) => n + secs(e), 0), [entries, running && Date.now()]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button size="sm" variant={running ? 'danger' : 'primary'} disabled={disabled} onClick={() => onChange?.(running ? entries.map((e) => (e === running ? { ...e, stoppedAt: new Date().toISOString() } : e)) : [...entries, { startedAt: new Date().toISOString(), stoppedAt: null }])}><Icon name={running ? 'stop' : 'play'} />{running ? 'Stop' : 'Start'}</Button>
        <span className="font-mono text-lg tabular-nums text-ink">{fmt(total)}</span>
        {allowManual && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { const end = new Date(); onChange?.([...entries, { startedAt: new Date(end - 15 * 60000).toISOString(), stoppedAt: end.toISOString(), manual: true }]); }}>Add 15 min</Button>}
      </div>
      {entries.length > 0 && <ul className="space-y-1 text-xs text-muted">{entries.slice(-5).map((e, i) => <li key={i}>{new Date(e.startedAt).toLocaleString()} · {fmt(secs(e))}{e.manual ? ' · manual' : ''}</li>)}</ul>}
    </div>
  );
}

/** Status path: the stages as a row of steps; clicking one chooses it. */
export function StatusPath({ stages = [], value, onChange, disabled }) {
  const index = stages.findIndex((s) => s.value === value);
  const guidance = stages[index]?.guidance;
  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap gap-1.5" aria-label="Stages">
        {stages.map((s, i) => (
          <li key={s.value}>
            <button type="button" disabled={disabled} aria-current={i === index ? 'step' : undefined} onClick={() => onChange?.(s.value)}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed', i === index ? 'border-accent bg-accent text-accent-ink' : i < index ? 'border-accent/30 bg-accent-soft text-link' : 'border-line-strong bg-surface text-muted hover:bg-surface-2')}>
              {i < index && <Icon name="check" className="size-3.5" />}{s.label}
            </button>
          </li>
        ))}
      </ol>
      {guidance && <p className="text-xs text-muted">{guidance}</p>}
    </div>
  );
}

export { FormField };
