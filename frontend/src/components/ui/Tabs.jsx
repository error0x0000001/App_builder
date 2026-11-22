import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Underlined tab strip. Controlled: `value` + `onChange(id)`; content is rendered by the caller. */
export function Tabs({ tabs, value, onChange, label, className }) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 border-b border-line', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id} type="button" role="tab" aria-label={tab.iconOnly ? tab.label : undefined} title={tab.iconOnly ? tab.label : undefined} aria-selected={tab.id === value} onClick={() => onChange(tab.id)}
          style={tab.id === value && tab.hue != null ? { borderColor: `oklch(0.6 0.2 ${tab.hue})`, '--h': tab.hue } : undefined}
          className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors', tab.id === value ? (tab.hue != null ? 'text-ink' : 'border-accent text-ink') : 'border-transparent text-muted hover:text-ink')}
        >
          {tab.icon && <span className={tab.hue != null ? 'tint-text' : undefined} style={tab.hue != null ? { '--h': tab.hue } : undefined}><Icon name={tab.icon} className="size-4" /></span>}{!tab.iconOnly && tab.label}
        </button>
      ))}
    </div>
  );
}
