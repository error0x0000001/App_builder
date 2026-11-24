import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';

export const STATUS = {
  unconfigured: { label: 'Not connected', tone: 'neutral' },
  untested: { label: 'Not tested', tone: 'warning' },
  connected: { label: 'Connected', tone: 'success' },
  error: { label: 'Test failed', tone: 'danger' },
};

const HUE = { blue: 'blue', orange: 'orange', pink: 'pink', indigo: 'indigo', teal: 'teal', purple: 'purple', success: 'teal' };
/** Untitled UI style provider tile: a soft, tinted rounded square with the provider's initials (no third-party logos are bundled). */
export function ProviderTile({ def, size = 'md' }) {
  const hue = HUE[def.hue] ?? 'blue';
  const label = def.tile ?? initials(def.name.replace(/[^A-Za-z0-9 ]/g, ' '));
  return (
    <span aria-hidden="true" style={{ '--c': `var(--fi-${hue})` }} className={cn('grid shrink-0 place-items-center border border-line bg-[color-mix(in_srgb,var(--c)_14%,var(--surface))] font-semibold text-(--c)', size === 'lg' ? 'size-12 rounded-xl' : 'size-10 rounded-lg', label.length > 2 ? 'text-[11px] tracking-tight' : size === 'lg' ? 'text-base' : 'text-sm')}>
      {label}
    </span>
  );
}
