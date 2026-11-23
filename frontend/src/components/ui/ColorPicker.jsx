import { COLOR_PRESETS, HEX_RE, hexToHsv, hsvToHex } from '@app/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';
import { Popover } from './Popover.jsx';

const clamp = (n) => Math.min(1, Math.max(0, n));
const COMMIT_DELAY = 350;

/** Drag surface for one or two values (pointer + arrow keys). `onMove(x, y)` get 0–1; `onDone()` when the gesture ends. */
function Surface({ label, className, onMove, onDone, onKey, valueText, children }) {
  const ref = useRef(null);
  const emit = (e) => { const r = ref.current.getBoundingClientRect(); onMove(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)); };
  return (
    <div
      ref={ref} role="slider" tabIndex={0} aria-label={label} aria-valuetext={valueText} className={cn('relative touch-none outline-none focus-visible:ring-4 focus-visible:ring-ring', className)}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); emit(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) emit(e); }}
      onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); onDone(); }}
      onKeyDown={onKey}
    >{children}</div>
  );
}

/**
 * Colour picker in the style of Untitled UI's colour pickers: a saturation/brightness area, a hue slider, a hex field and preset swatches,
 * in a popover under a swatch + hex trigger. No browser colour input. `onChange(hex)` fires continuously while dragging (use it for a live
 * preview); `onCommit(hex)` when a gesture, key press, hex entry or swatch choice is finished (save there). `value` may be null (not set).
 */
export function ColorPicker({ value, onChange, onCommit, label, placeholder = 'Choose a colour', presets = COLOR_PRESETS }) {
  const anchor = useRef(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(value ?? '#7f56d9'));
  const [text, setText] = useState(value ?? '');
  const timer = useRef(null);
  const hex = hsvToHex(hsv);

  useEffect(() => { if (value) { setHsv(hexToHsv(value)); setText(value); } else setText(''); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (next) => { setHsv(next); setText(hsvToHex(next)); onChange?.(hsvToHex(next)); };
  const commit = (color = hex) => { clearTimeout(timer.current); onCommit?.(color); };
  const commitSoon = () => { clearTimeout(timer.current); timer.current = setTimeout(() => commit(), COMMIT_DELAY); };
  const choose = (color) => { const next = hexToHsv(color); setHsv(next); setText(color); onChange?.(color); commit(color); };
  const nudge = (axis) => (e) => {
    const step = e.shiftKey ? 0.1 : 0.02; const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    update(axis === 'hue' ? { ...hsv, h: (hsv.h + (d[0] || -d[1]) * step * 360 + 360) % 360 } : { ...hsv, s: clamp(hsv.s + d[0] * step), v: clamp(hsv.v - d[1] * step) });
    commitSoon();
  };
  const onText = (e) => { const t = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`; setText(t.slice(0, 7)); if (HEX_RE.test(t)) { setHsv(hexToHsv(t)); onChange?.(t.toLowerCase()); } };
  const endText = () => { if (HEX_RE.test(text)) commit(text.toLowerCase()); else setText(value ?? ''); };

  return (
    <>
      <button
        ref={anchor} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2.5 rounded-(--ctl-r) border border-line-strong bg-surface px-3 text-left text-sm outline-none transition focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-ring"
      >
        <span className="size-5 shrink-0 rounded-md border border-line-strong" style={{ background: value ?? 'transparent' }} aria-hidden="true" />
        <span className={cn('flex-1 font-medium tabular-nums', value ? 'uppercase text-ink' : 'text-placeholder')}>{value ?? placeholder}</span>
        <Icon name="chevron-down" className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} maxHeight={460} role="dialog" aria-label={`${label} picker`} className="w-64 p-3">
        <div className="space-y-3">
          <Surface
            label="Saturation and brightness" valueText={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
            className="h-36 cursor-crosshair rounded-lg border border-line" onMove={(x, y) => update({ ...hsv, s: x, v: 1 - y })} onDone={() => commit()} onKey={nudge('area')}
          >
            <span aria-hidden="true" className="absolute inset-0 rounded-[inherit]" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }} />
            <span aria-hidden="true" className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex, outline: '1px solid rgb(0 0 0 / 0.35)' }} />
          </Surface>
          <Surface
            label="Hue" valueText={`${Math.round(hsv.h)} degrees`} className="h-3 cursor-pointer rounded-full" onMove={(x) => update({ ...hsv, h: x * 359.99 })} onDone={() => commit()} onKey={nudge('hue')}
          >
            <span aria-hidden="true" className="absolute inset-0 rounded-[inherit]" style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
            <span aria-hidden="true" className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)`, outline: '1px solid rgb(0 0 0 / 0.35)' }} />
          </Surface>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:ring-4 focus-within:ring-ring">
            <span className="size-4 shrink-0 rounded border border-line-strong" style={{ background: hex }} aria-hidden="true" />
            <input
              aria-label="Hex colour" value={text} onChange={onText} onBlur={endText} onKeyDown={(e) => { if (e.key === 'Enter') endText(); }} spellCheck={false} autoComplete="off" maxLength={7}
              className="min-w-0 flex-1 bg-transparent text-sm uppercase tabular-nums outline-none placeholder:text-placeholder" placeholder="#7F56D9"
            />
          </label>
          <div role="group" aria-label="Preset colours" className="grid grid-cols-7 gap-2">
            {presets.map((color) => (
              <button
                key={color} type="button" aria-label={color} title={color} onClick={() => choose(color)}
                className={cn('grid size-7 place-items-center rounded-full border border-black/10 outline-none focus-visible:ring-4 focus-visible:ring-ring', color === value && 'outline-2 outline-offset-2 outline-ink')} style={{ background: color }}
              />
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
