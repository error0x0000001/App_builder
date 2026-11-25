import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { cn } from '../../lib/cn.js';
import { hueOf } from '../../lib/hue.js';

export const HUES = ['blue', 'indigo', 'teal', 'orange', 'purple', 'pink'];
const VAR = { brand: 'var(--accent)', blue: 'var(--fi-blue)', indigo: 'var(--fi-indigo)', teal: 'var(--fi-teal)', orange: 'var(--fi-orange)', purple: 'var(--fi-purple)', pink: 'var(--fi-pink)', success: 'var(--success)', warning: 'var(--warning)', error: 'var(--danger)', gray: 'var(--muted)' };
export const hueFor = (text) => HUES[hueOf(String(text)) % HUES.length];
/** Soft tint of a hue over the surface — adapts to light, dark and every palette because it only mixes theme variables. */
export const tint = (color, pct = 14) => ({ '--c': VAR[color] ?? VAR.brand, background: `color-mix(in srgb, var(--c) ${pct}%, var(--surface))` });
const wash = (color) => ({ '--c': VAR[color] ?? VAR.brand, background: 'linear-gradient(120deg, color-mix(in srgb, var(--c) 22%, var(--surface)) 0%, color-mix(in srgb, var(--c) 8%, var(--surface)) 55%, var(--surface) 100%)' });

/** A page's banner: coloured wash, icon tile, title, one line of help, actions on the right and an optional KPI row. Replaces a plain heading. */
export function Hero({ icon, color = 'brand', title, subtitle, actions, children, className }) {
  return (
    <header style={wash(color)} className={cn('rounded-2xl border border-line p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span style={{ '--c': VAR[color] }} className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface text-(--c) ring-1 ring-line"><Icon name={icon} className="size-6" /></span>
        <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-semibold tracking-tight text-ink">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

/** One coloured number: tinted tile, big value, caption. */
export function Kpi({ icon, color = 'brand', label, value, caption, to }) {
  const body = (
    <>
      <span style={{ '--c': VAR[color] }} className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--c)_16%,var(--surface))] text-(--c)"><Icon name={icon} className="size-5" /></span>
      <span className="min-w-0"><span className="block text-2xl font-semibold leading-none tracking-tight text-ink">{value}</span><span className="mt-1 block truncate text-xs font-medium text-muted">{label}</span>{caption && <span className="block truncate text-[11px] text-placeholder">{caption}</span>}</span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-xl border border-line bg-surface p-3';
  return to ? <a href={to} className={cn(cls, 'transition-colors hover:border-line-strong')}>{body}</a> : <div className={cls}>{body}</div>;
}
export const KpiStrip = ({ children, className }) => <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>;

/** A titled block with a coloured icon tile — the building block of every page body. */
export function Panel({ icon, color = 'brand', title, description, action, children, className, bodyClassName }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface', className)}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        {icon && <FeaturedIcon icon={icon} color={color} size="sm" shape="square" />}
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-ink">{title}</h2>{description && <p className="truncate text-xs text-muted">{description}</p>}</div>
        {action}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Rows of label → value, tight. */
export const Facts = ({ rows }) => (
  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
    {rows.filter(Boolean).map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="min-w-0 truncate text-right font-medium text-ink">{v}</dd></div>))}
  </dl>
);
