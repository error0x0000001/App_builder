import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover border-transparent',
  neutral: 'bg-surface text-ink border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-link border-transparent hover:bg-surface-2',
  danger: 'bg-danger text-white border-transparent hover:opacity-90',
};
const SIZES = { icon: 'size-8 p-0', sm: 'h-9 px-3.5 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-11 px-[18px] text-base' };

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
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-btn) border font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </Component>
  );
});
