import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Compact search box (32px): icon + input. Controlled via value/onChange like a normal input. */
export const SearchInput = forwardRef(function SearchInput({ className, label = 'Search', ...rest }, ref) {
  return (
    <label className={cn('flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-muted focus-within:border-link focus-within:ring-4 focus-within:ring-ring', className)}>
      <Icon name="search" className="size-4 shrink-0" />
      <input ref={ref} type="search" aria-label={label} className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" {...rest} />
    </label>
  );
});
