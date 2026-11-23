import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';
import { hueOf } from './Badge.jsx';

/** A coloured rounded tile with the initials of a record (Untitled's company / file tiles); the colour follows the name. */
export const NameTile = ({ name, size = 'size-9', className }) => (
  <span aria-hidden="true" style={{ '--c': `var(--fi-${hueOf(name ?? '')})` }} className={cn(size, 'grid shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--c)_16%,transparent)] text-xs font-semibold text-(--c)', className)}>{initials(name ?? '?')}</span>
);
