import { Icon } from '../components/ui/Icon.jsx';
import { Kbd, MOD_KEY } from '../components/ui/Kbd.jsx';
import { Button } from '../components/ui/Button.jsx';
import { cn } from '../lib/cn.js';
import { hueOf, KIND_HUE } from '../lib/hue.js';
import { initials } from '../lib/format.js';

export const KIND_ICON = { page: 'home', record: 'users', person: 'user', setting: 'sliders', config: 'sliders' };

/** The matched part of a title in bold. */
function Highlight({ text, query }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-transparent font-semibold text-ink">{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

/** "RECENT  3" style section heading. */
export const SectionLabel = ({ children, count }) => (
  <p className="flex items-center gap-2 px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
    {children}{count != null && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] leading-none">{count}</span>}
  </p>
);

/** One result: avatar/tile · title • subtitle ………… tag (or ↵ when highlighted). */
export function ResultRow({ item, query, id, active, onHover, onOpen }) {
  const hue = item.kind === 'person' ? hueOf(item.title) : KIND_HUE[item.kind] ?? KIND_HUE.page;
  const tagHue = item.kind === 'record' ? hueOf(item.tag ?? '') : hue;
  const lead = item.kind === 'person'
    ? <span style={{ '--h': hue }} className="tint-solid grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold" aria-hidden="true">{initials(item.title)}</span>
    : <span style={{ '--h': hue }} className="tint grid size-8 shrink-0 place-items-center rounded-lg border"><Icon name={KIND_ICON[item.kind] ?? 'home'} className="size-4" /></span>;
  return (
    <button
      id={id} type="button" role="option" aria-selected={active} onMouseMove={onHover} onClick={onOpen}
      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm', active && 'bg-surface-2')}
    >
      {lead}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate font-medium text-ink"><Highlight text={item.title} query={query} /></span>
        {item.subtitle && <><span aria-hidden="true" className="text-muted">•</span><span className="truncate text-muted">{item.subtitle}</span></>}
      </span>
      {active
        ? <span style={{ '--h': 285 }} className="tint grid size-6 shrink-0 place-items-center rounded-md border"><Icon name="chevron-right" className="size-3.5" /></span>
        : item.tag && <span style={{ '--h': tagHue }} className="tint max-w-40 shrink-0 truncate rounded-md border px-2 py-0.5 text-xs font-medium">{item.tag}</span>}
    </button>
  );
}

/** Pill filter (People, Accounts …) — same look as the reference chips. */
export const FilterChip = ({ selected, hue, children, ...rest }) => (
  <button
    type="button" aria-pressed={selected} style={{ '--h': hue }} {...rest}
    className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', selected ? 'tint border font-medium' : 'border-line text-muted hover:bg-surface-2 hover:text-ink')}
  ><span aria-hidden="true" style={{ '--h': hue }} className="tint-solid size-2 rounded-full" />{children}</button>
);

/** Round 28px icon button (filter / sort) at the end of the chip row. */
export const RoundButton = ({ icon, label, active, ...rest }) => (
  <button type="button" aria-label={label} title={label} className={cn('grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring', active && 'bg-surface-2 text-ink')} {...rest}><Icon name={icon} className="size-3.5" /></button>
);

/** Soft grid fading out at the edges with three tilted tiles on it — the "nothing found" picture. */
function EmptyArt() {
  const grid = 'linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)';
  const fade = 'radial-gradient(circle at center, #000 25%, transparent 70%)';
  return (
    <div className="relative mb-3 grid h-28 w-56 place-items-center">
      <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: grid, backgroundSize: '18px 18px', maskImage: fade, WebkitMaskImage: fade }} />
      <div className="relative flex items-center">
        {[285, 160, 250, 340, 40].map((hue, i) => (
          <span key={hue} style={{ '--h': hue, zIndex: i === 2 ? 3 : i === 1 || i === 3 ? 2 : 1, opacity: i === 0 || i === 4 ? 0.55 : 1 }} className="tint-solid -ml-3 grid size-11 place-items-center rounded-full border-2 border-surface first:ml-0"><Icon name="user" className="size-5" /></span>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, onClear }) {
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-4 text-center">
      <EmptyArt />
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-muted">{hint}</p>
      <Button size="sm" variant="neutral" className="mt-3" onClick={onClear}>Clear filters</Button>
    </div>
  );
}

const Hint = ({ keys, children }) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap">
    <span className="flex items-center gap-1">{keys.map((k) => <Kbd key={k} className="grid h-5 min-w-5 place-items-center rounded border-line bg-surface px-1 text-[10px] opacity-100">{k}</Kbd>)}</span>{children}
  </span>
);

export const Footer = () => (
  <footer className="flex items-center gap-3.5 overflow-hidden border-t border-line bg-surface-2/60 px-4 py-2 text-xs text-muted">
    <Hint keys={['↑', '↓']}>Select</Hint>
    <Hint keys={['↵']}>Open</Hint>
    <span className="hidden items-center gap-4 sm:flex">
      <Hint keys={[MOD_KEY, '↵']}>New tab</Hint>
      <Hint keys={[MOD_KEY, '⇧', 'L']}>Copy link</Hint>
    </span>
    <Hint keys={['Esc']}>Close</Hint>
  </footer>
);
