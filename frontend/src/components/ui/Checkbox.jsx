import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Drawn checkbox. A real (visually hidden) input keeps forms, labels and screen readers working; the box is ours. */
export const Checkbox = forwardRef(function Checkbox({ label, error, id: idProp, className, ...rest }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div>
      <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-ink', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
        <span className="relative mt-0.5 inline-flex size-4 shrink-0">
          <input ref={ref} id={id} type="checkbox" aria-invalid={Boolean(error) || undefined} className="peer absolute inset-0 size-full cursor-[inherit] opacity-0" {...rest} />
          <span aria-hidden="true" className={cn('pointer-events-none grid size-4 place-items-center rounded-[4px] border bg-surface text-accent-ink transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-ring [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100', error ? 'border-danger' : 'border-line-strong')}>
            <Icon name="check" className="size-3" strokeWidth={3} />
          </span>
        </span>
        {label && <span>{label}</span>}
      </label>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
});
