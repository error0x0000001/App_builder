import { useId } from 'react';
import { cn } from '../../lib/cn.js';
import { Switch } from './Switch.jsx';

/**
 * A titled list of on/off switches bound to an array of chosen values — the one way the app lets you turn several things on or off
 * (which events a channel receives, which add-ons a person has). `options`: [{ value, label, description? }].
 * `onChange(nextValues, changedValue)`; `isDisabled(value)` greys a single row (e.g. while it saves).
 */
export function SwitchGroup({ label, hint, options, value = [], onChange, isDisabled, className }) {
  const id = useId();
  const chosen = new Set(value);
  return (
    <fieldset aria-describedby={hint ? `${id}-hint` : undefined} className={cn('min-w-0', className)}>
      {label && <legend className="mb-1 text-sm font-medium text-ink">{label}</legend>}
      <div className="divide-y divide-line">
        {options.map((o) => (
          <div key={o.value} className="py-2.5 first:pt-1.5 last:pb-1.5">
            <Switch
              label={o.label} description={o.description} checked={chosen.has(o.value)} disabled={isDisabled?.(o.value) ?? false}
              onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value), o.value)}
            />
          </div>
        ))}
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}
