import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn.js';
import { FormField, controlClass, describedBy } from './FormField.jsx';

const normalize = (option) => (typeof option === 'string' ? { value: option, label: option } : option);

/** Native select (best mobile UX + accessibility). `options` may be strings or { value, label }. */
export const Select = forwardRef(function Select({ label, hint, error, options, placeholder, required, className, id: idProp, ...rest }, ref) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <select
        ref={ref}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy({ id, error, hint })}
        className={cn(controlClass(error), 'outline-none disabled:opacity-60', className)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(normalize).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FormField>
  );
});
