import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover border-transparent',
  neutral: 'bg-surface text-ink border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-link border-transparent hover:bg-surface-2',
  danger: 'bg-danger text-white border-transparent hover:opacity-90',
};
const SIZES = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-11 px-5 text-sm' };

/** The only button in the app. Pass `as={Link}` to render a router link with identical styling. */
export const Button = forwardRef(function Button(
  { as: Component = 'button', variant = 'primary', size = 'md', loading = false, fullWidth = false, className, children, disabled, ...rest },
  ref,
) {
  const isButton = Component === 'button';
  return (
    <Component
      ref={ref}
      {...(isButton ? { type: rest.type ?? 'button', disabled: disabled || loading } : {})}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </Component>
  );
});
