import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';

/** A person's photo (`src`), or their initials when there is none or it fails to load. `shape="square"` gives the rounded-square tile used in the sidebar. */
export const Avatar = ({ name, src, size = 'size-8', shape = 'round', className }) => {
  const [broken, setBroken] = useState(false);
  const rounded = shape === 'square' ? 'rounded-lg' : 'rounded-full';
  if (src && !broken) return <img src={src} alt="" onError={() => setBroken(true)} className={cn(size, 'shrink-0 object-cover', rounded, className)} aria-hidden="true" />;
  return <span className={cn(size, 'grid shrink-0 place-items-center bg-accent text-xs font-semibold text-accent-ink', rounded, className)} aria-hidden="true">{initials(name)}</span>;
};
