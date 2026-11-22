import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Compact search box (32px) with our own clear button (no browser-drawn one). Pass `onClear` to enable it. */
export const SearchInput = forwardRef(function SearchInput({ className, label = 'Search', value, onClear, ...rest }, ref) {
  return (
    <label className={cn('flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-muted focus-within:border-link focus-within:ring-4 focus-within:ring-ring', className)}>
      <Icon name="search" className="size-4 shrink-0" />
      <input ref={ref} type="text" inputMode="search" autoComplete="off" spellCheck={false} aria-label={label} value={value} className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" {...rest} />
      {onClear && value ? <button type="button" aria-label="Clear search" onClick={onClear} className="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"><Icon name="x" className="size-3.5" /></button> : null}
    </label>
  );
});
