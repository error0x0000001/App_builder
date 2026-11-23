import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Untitled UI "Featured icon" (light theme): an icon in a softly tinted circle. Colours are the Untitled families; sizes sm 32 · md 40 · lg 48 · xl 56. */
const COLORS = {
  brand: 'var(--accent)', gray: 'var(--muted)', success: 'var(--success)', warning: 'var(--warning)', error: 'var(--danger)',
  blue: 'var(--fi-blue)', purple: 'var(--fi-purple)', pink: 'var(--fi-pink)', orange: 'var(--fi-orange)', teal: 'var(--fi-teal)', indigo: 'var(--fi-indigo)',
};
const SIZES = { sm: ['size-8', 'size-4'], md: ['size-10', 'size-5'], lg: ['size-12', 'size-6'], xl: ['size-14', 'size-7'] };

export function FeaturedIcon({ icon, color = 'brand', size = 'md', shape = 'round', className }) {
  const [box, glyph] = SIZES[size];
  return (
    <span aria-hidden="true" style={{ '--c': COLORS[color] }} className={cn(box, 'grid shrink-0 place-items-center bg-[color-mix(in_srgb,var(--c)_14%,transparent)] text-(--c)', shape === 'round' ? 'rounded-full' : 'rounded-lg', className)}>
      <Icon name={icon} className={glyph} />
    </span>
  );
}
