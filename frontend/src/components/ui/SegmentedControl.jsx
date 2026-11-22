import { cn } from '../../lib/cn.js';

/** Few mutually exclusive choices side by side (our radio group). Controlled: `value` + `onChange(value)`. */
export function SegmentedControl({ options, value, onChange, label, disabled = false }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => onChange(option.value)}
            className={cn('h-8 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60', selected ? 'border border-line bg-surface font-medium text-ink' : 'border border-transparent text-muted hover:text-ink')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
