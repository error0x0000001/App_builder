import { forwardRef, useId } from 'react';

/** Accessible on/off switch (a real checkbox with role="switch"). */
export const Switch = forwardRef(function Switch({ label, description, id: idProp, ...rest }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input ref={ref} id={id} type="checkbox" role="switch" className="peer sr-only" {...rest} />
        <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-ring peer-disabled:opacity-60" />
        <span className="pointer-events-none absolute left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
});
