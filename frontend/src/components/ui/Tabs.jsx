import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Underlined tab strip (Untitled UI "underline" tabs; `tone="ink"` = black underline). Controlled: `value` + `onChange(id)`; content is rendered by the caller. A tab may have an `icon`; `iconOnly` shows just the icon (label becomes its tooltip). */
export function Tabs({ tabs, value, onChange, label, className, tone = 'brand' }) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 border-b border-line', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id} type="button" role="tab" aria-label={tab.iconOnly ? tab.label : undefined} title={tab.iconOnly ? tab.label : undefined} aria-selected={tab.id === value} onClick={() => onChange(tab.id)}
          className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', tab.id === value ? (tone === 'ink' ? 'border-ink text-ink' : 'border-accent text-link') : 'border-transparent text-muted hover:text-ink')}
        >
          {tab.icon && <Icon name={tab.icon} className="size-4" />}{!tab.iconOnly && tab.label}
        </button>
      ))}
    </div>
  );
}
