import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/**
 * Untitled UI "Utility button": a small, quiet icon button (6px padding, 6px radius, tertiary grey that darkens on hover) for toolbars inside inputs and cards — attach,
 * emoji, voice. `tone="brand"` with `children` is the text variant ("Send"). Spread-friendly, so it works as a DropdownMenuTrigger target.
 */
export const UtilityButton = forwardRef(function UtilityButton({ icon, label, tone = 'gray', className, children, ...rest }, ref) {
  return (
    <button
      ref={ref} type="button" aria-label={label} title={label}
      className={cn('inline-flex shrink-0 items-center justify-center gap-1 rounded-md p-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'brand' ? 'px-2 text-link hover:bg-accent-soft' : 'text-placeholder hover:bg-surface-2 hover:text-ink', className)}
      {...rest}
    >
      {icon && <Icon name={icon} className="size-4" />}
      {children}
    </button>
  );
});
