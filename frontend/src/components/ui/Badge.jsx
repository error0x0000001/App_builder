import { cn } from '../../lib/cn.js';

const TONES = {
  neutral: 'border-line-strong bg-surface-2 text-ink', accent: 'border-accent/25 bg-accent-soft text-link', success: 'border-success/25 bg-success/10 text-success', warning: 'border-warning/30 bg-warning/10 text-warning', danger: 'border-danger/25 bg-danger/10 text-danger',
};
/** Untitled's other badge colours, drawn from the featured-icon hues so light, dark and every theme stay in tune. */
export const HUES = ['blue', 'purple', 'pink', 'orange', 'teal', 'indigo'];
const hueClass = 'border-[color-mix(in_srgb,var(--c)_30%,transparent)] bg-[color-mix(in_srgb,var(--c)_12%,transparent)] text-(--c)';

/** A stable colour for a value (the same word is always the same colour), so tags and categories are told apart at a glance. */
export const hueOf = (value) => HUES[[...String(value)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % HUES.length];

/** Untitled UI badge: `tone` (semantic) or `hue` (blue | purple | pink | orange | teal | indigo); `dot` adds the leading status dot. */
export const Badge = ({ tone = 'neutral', hue, dot = false, children }) => (
  <span style={hue ? { '--c': `var(--fi-${hue})` } : undefined} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', hue ? hueClass : TONES[tone])}>
    {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}{children}
  </span>
);
