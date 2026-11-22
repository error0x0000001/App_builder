import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn.js';
import { FormField, describedBy } from './FormField.jsx';

/** Multi-line text with the same label/hint/error chrome as Input. */
export const Textarea = forwardRef(function Textarea({ label, hint, error, required, rows = 3, className, id: idProp, ...rest }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy({ id, error, hint })}
        className={cn('w-full resize-y rounded-(--ctl-r) border bg-surface px-3.5 py-2 text-sm text-ink outline-none transition focus:border-link focus:ring-4 focus:ring-ring disabled:opacity-60', error ? 'border-danger' : 'border-line', className)}
        {...rest}
      />
    </FormField>
  );
});
