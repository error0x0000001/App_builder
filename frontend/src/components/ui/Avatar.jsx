import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';

const DOT = { 'size-6': 'size-1.5', 'size-7': 'size-2', 'size-8': 'size-2', 'size-9': 'size-2.5', 'size-10': 'size-2.5', 'size-11': 'size-3', 'size-12': 'size-3', 'size-20': 'size-4', 'size-24': 'size-4', 'size-28': 'size-5' };

/**
 * A person's photo (`src`), or their initials when there is none or it fails to load. `shape="square"` gives the rounded-square tile used in the sidebar.
 * `status="online"` adds Untitled UI's presence dot (green, ringed in the page colour) at the bottom-right.
 */
export const Avatar = ({ name, src, size = 'size-8', shape = 'round', status, className }) => {
  const [broken, setBroken] = useState(false);
  const rounded = shape === 'square' ? 'rounded-lg' : 'rounded-full';
  const face = src && !broken
    ? <img src={src} alt="" onError={() => setBroken(true)} className={cn(size, 'shrink-0 object-cover', rounded, className)} aria-hidden="true" />
    : <span className={cn(size, 'grid shrink-0 place-items-center bg-accent text-xs font-semibold text-accent-ink', rounded, className)} aria-hidden="true">{initials(name)}</span>;
  if (!status) return face;
  return (
    <span className="relative inline-flex shrink-0">
      {face}
      <span title={status === 'online' ? 'Online' : 'Offline'} className={cn('absolute bottom-0 right-0 rounded-full ring-2 ring-surface', DOT[size] ?? 'size-2.5', status === 'online' ? 'bg-success' : 'bg-line-strong')} />
    </span>
  );
};
