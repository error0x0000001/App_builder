import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/format.js';
import { Button } from './Button.jsx';
import { FormField, controlClass } from './FormField.jsx';
import { Icon } from './Icon.jsx';
import { Popover } from './Popover.jsx';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (value) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
const todayParts = () => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; };

/** The 6×7 grid of a month (leading/trailing days from the neighbouring months). */
function grid(y, m) {
  const first = new Date(y, m, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => { const date = new Date(y, m, 1 - first + i); return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate(), outside: date.getMonth() !== m }; });
}

/** Our own date picker: a button showing the date, a calendar popover (month paging, keyboard arrows, Today, Clear). Value is "YYYY-MM-DD". */
export const DatePicker = forwardRef(function DatePicker({ label, hint, error, required, value, onChange, onBlur, name, disabled, placeholder = 'Select date', className, id: idProp }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  const trigger = useRef(null);
  const panel = useRef(null);
  useImperativeHandle(ref, () => trigger.current);
  const selected = parse(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? todayParts());
  const today = todayParts();

  const close = () => { setOpen(false); onBlur?.(); };
  const show = () => { setView(selected ?? todayParts()); setOpen(true); setTimeout(() => panel.current?.querySelector('[data-selected="true"], [data-today="true"]')?.focus(), 0); };
  const pick = (d) => { onChange?.(iso(d.y, d.m, d.d)); setOpen(false); trigger.current?.focus(); };
  const page = (delta) => { const next = new Date(view.y, view.m + delta, 1); setView({ y: next.getFullYear(), m: next.getMonth(), d: 1 }); };

  const onGridKey = (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    const current = event.target.dataset.date && parse(event.target.dataset.date);
    if (!current) return;
    if (step !== undefined) {
      event.preventDefault();
      const next = new Date(current.y, current.m, current.d + step);
      setView({ y: next.getFullYear(), m: next.getMonth(), d: next.getDate() });
      setTimeout(() => panel.current?.querySelector(`[data-date="${iso(next.getFullYear(), next.getMonth(), next.getDate())}"]`)?.focus(), 0);
    } else if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); page(event.key === 'PageDown' ? 1 : -1); }
  };

  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <button
        ref={trigger} id={id} type="button" name={name} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-invalid={Boolean(error) || undefined}
        onClick={() => (open ? close() : show())}
        className={cn(controlClass(error), 'flex items-center justify-between gap-2 text-left outline-none disabled:cursor-not-allowed disabled:opacity-60', className)}
      >
        <span className={cn('truncate', !selected && 'text-muted')}>{selected ? formatDate(new Date(selected.y, selected.m, selected.d)) : placeholder}</span>
        <Icon name="calendar" className="size-4 shrink-0 text-muted" />
      </button>
      <Popover anchorRef={trigger} open={open} onClose={close} maxHeight={420} className="w-72 p-3" role="dialog" aria-label="Choose a date">
        <div ref={panel} onKeyDown={onGridKey}>
          <div className="mb-2 flex items-center justify-between">
            <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => page(-1)}><Icon name="chevron-left" className="size-4" /></Button>
            <span className="text-sm font-medium" aria-live="polite">{MONTH.format(new Date(view.y, view.m, 1))}</span>
            <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => page(1)}><Icon name="chevron-right" className="size-4" /></Button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-muted">{WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}</div>
          <div role="grid" className="grid grid-cols-7 gap-y-0.5">
            {grid(view.y, view.m).map((day) => {
              const date = iso(day.y, day.m, day.d);
              const isSelected = selected && date === iso(selected.y, selected.m, selected.d);
              const isToday = date === iso(today.y, today.m, today.d);
              return (
                <button
                  key={date} type="button" data-date={date} data-selected={isSelected || undefined} data-today={isToday || undefined} aria-label={date} aria-pressed={isSelected || undefined}
                  tabIndex={isSelected || (!selected && isToday) ? 0 : -1} onClick={() => pick(day)}
                  className={cn('mx-auto grid size-8 place-items-center rounded-md text-sm outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring', day.outside && 'text-muted/50', isToday && !isSelected && 'border border-line font-medium', isSelected && 'bg-accent text-accent-ink hover:bg-accent-hover')}
                >
                  {day.d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <Button size="sm" variant="ghost" onClick={() => pick(todayParts())}>Today</Button>
            {selected && <Button size="sm" variant="ghost" onClick={() => { onChange?.(''); setOpen(false); trigger.current?.focus(); }}>Clear</Button>}
          </div>
        </div>
      </Popover>
    </FormField>
  );
});
