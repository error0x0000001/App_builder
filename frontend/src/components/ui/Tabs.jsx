import { cn } from '../../lib/cn.js';

/** Underlined tab strip. Controlled: `value` + `onChange(id)`; content is rendered by the caller. */
export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.id} type="button" role="tab" aria-selected={tab.id === value} onClick={() => onChange(tab.id)}
          className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab.id === value ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
