import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Underlined tab strip. Controlled: `value` + `onChange(id)`; content is rendered by the caller. */
export function Tabs({ tabs, value, onChange, label, className }) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 border-b border-line', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id} type="button" role="tab" aria-selected={tab.id === value} onClick={() => onChange(tab.id)}
          className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab.id === value ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {tab.icon && <Icon name={tab.icon} className="size-4" />}{tab.label}
        </button>
      ))}
    </div>
  );
}
