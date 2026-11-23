import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn.js';
import { FormField, controlClass, describedBy } from './FormField.jsx';

/** Text input with optional label, hint, error, and prefix/suffix adornments. */
export const Input = forwardRef(function Input({ label, hint, error, prefix, suffix, required, className, id: idProp, ...rest }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <div className={cn(controlClass(error), 'flex items-center gap-2', className)}>
        {prefix && <span className="shrink-0 text-sm text-muted">{prefix}</span>}
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy({ id, error, hint })}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-placeholder disabled:opacity-60"
          {...rest}
        />
        {suffix}
      </div>
    </FormField>
  );
});
