import { cn } from '../../lib/cn.js';

/** Single choice shown as selectable cards. options: [{ value, label, preview? }]. */
export function RadioCardGroup({ name, value, onChange, options, disabled = false, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label key={option.value} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', selected ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2', disabled && 'cursor-not-allowed opacity-60')}>
            <input type="radio" name={name} value={option.value} checked={selected} disabled={disabled} onChange={() => onChange(option.value)} className="sr-only" />
            {option.preview}
            <span className="font-medium text-ink">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
