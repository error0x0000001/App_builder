import { forwardRef, useId } from 'react';

export const Checkbox = forwardRef(function Checkbox({ label, error, id: idProp, ...rest }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input ref={ref} id={id} type="checkbox" aria-invalid={Boolean(error) || undefined} className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line accent-accent" {...rest} />
        <span>{label}</span>
      </label>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
});
