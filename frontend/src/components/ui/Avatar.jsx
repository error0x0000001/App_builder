import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';

/** Initials avatar. `shape="square"` gives the rounded-square tile used in the sidebar. */
export const Avatar = ({ name, size = 'size-8', shape = 'round', className }) => (
  <span className={cn(size, 'grid shrink-0 place-items-center bg-accent text-xs font-semibold text-accent-ink', shape === 'square' ? 'rounded-lg' : 'rounded-full', className)} aria-hidden="true">{initials(name)}</span>
);
