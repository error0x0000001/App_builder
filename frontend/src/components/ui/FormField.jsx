import { cn } from '../../lib/cn.js';

/** Shared chrome for every form control: label, hint, error — wired up for screen readers. */
export function FormField({ id, label, hint, error, required, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-muted">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const describedBy = ({ id, error, hint }) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export const controlClass = (error) =>
  cn(
    'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink transition focus-within:border-link focus-within:ring-4 focus-within:ring-ring',
    error ? 'border-danger' : 'border-line',
  );
