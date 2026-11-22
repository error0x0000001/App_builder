import { forwardRef, useCallback, useId, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { FormField, controlClass } from './FormField.jsx';
import { Icon } from './Icon.jsx';
import { Popover } from './Popover.jsx';

const normalize = (option) => (typeof option === 'string' ? { value: option, label: option } : option);

/**
 * Our own select: a button that opens a listbox (no browser-drawn popup). Controlled — `value` + `onChange(value)`.
 * Keyboard: Arrow keys / Home / End move, Enter or Space picks, Escape closes, typing jumps to a matching option.
 * `options` may be strings or { value, label }. A `placeholder` is also offered as the "no selection" row.
 */
export const Select = forwardRef(function Select({ label, hint, error, options, placeholder, required, value, onChange, onBlur, name, disabled, className, size = 'md', id: idProp, 'aria-label': ariaLabel }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  const trigger = useRef(null);
  useImperativeHandle(ref, () => trigger.current);
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const rows = [...(placeholder ? [{ value: '', label: placeholder, empty: true }] : []), ...options.map(normalize)];
  const selected = rows.find((r) => r.value === (value ?? '') && !r.empty);
  const close = useCallback(() => { setOpen(false); onBlur?.(); }, [onBlur]);

  const show = () => { setActive(Math.max(0, rows.findIndex((r) => r.value === (value ?? '') && !(r.empty && value)))); setOpen(true); };
  const choose = (row) => { onChange?.(row.value); setOpen(false); trigger.current?.focus(); };
  const move = (next) => {
    const index = (next + rows.length) % rows.length;
    setActive(index);
    document.getElementById(`${id}-opt-${index}`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event) => {
    const { key } = event;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) { event.preventDefault(); show(); }
      return;
    }
    if (key === 'ArrowDown') { event.preventDefault(); move(active + 1); }
    else if (key === 'ArrowUp') { event.preventDefault(); move(active - 1); }
    else if (key === 'Home') { event.preventDefault(); move(0); }
    else if (key === 'End') { event.preventDefault(); move(rows.length - 1); }
    else if (key === 'Enter' || key === ' ') { event.preventDefault(); choose(rows[active]); }
    else if (key === 'Tab') close();
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey) { // type-ahead
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + key.toLowerCase(), at: now };
      const hit = rows.findIndex((r, i) => i !== 0 || !r.empty ? r.label.toLowerCase().startsWith(typed.current.text) : false);
      if (hit >= 0) move(hit);
    }
  };

  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        name={name}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        aria-invalid={Boolean(error) || undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        className={cn(controlClass(error), 'flex items-center justify-between gap-2 text-left outline-none disabled:cursor-not-allowed disabled:opacity-60', size === 'sm' && 'h-8 w-auto px-2.5 text-[13px]', className)}
      >
        <span className={cn('truncate', !selected && 'text-muted')}>{selected?.label ?? placeholder ?? ''}</span>
        <Icon name="chevron-down" className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <Popover anchorRef={trigger} open={open} onClose={close} matchWidth>
        <ul id={`${id}-list`} role="listbox" aria-label={label ?? ariaLabel} className="space-y-px">
          {rows.map((row, i) => {
            const isSelected = !row.empty && row.value === (value ?? '');
            return (
              <li
                key={`${row.value}-${i}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(event) => { event.preventDefault(); choose(row); }}
                className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm', i === active && 'bg-surface-2', isSelected && 'font-medium', row.empty && 'text-muted')}
              >
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {isSelected && <Icon name="check" className="size-4 shrink-0 text-link" />}
              </li>
            );
          })}
        </ul>
      </Popover>
    </FormField>
  );
});
