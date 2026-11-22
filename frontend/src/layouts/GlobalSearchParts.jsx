import { Avatar } from '../components/ui/Avatar.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Kbd, MOD_KEY } from '../components/ui/Kbd.jsx';
import { Button } from '../components/ui/Button.jsx';
import { cn } from '../lib/cn.js';

export const KIND_ICON = { page: 'home', record: 'users', person: 'user', setting: 'sliders', config: 'sliders' };

/** The matched part of a title in bold. */
function Highlight({ text, query }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-transparent font-semibold text-ink">{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

/** "RECENT  3" style section heading. */
export const SectionLabel = ({ children, count }) => (
  <p className="flex items-center gap-2 px-3 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted">
    {children}{count != null && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] leading-none">{count}</span>}
  </p>
);

/** One result: avatar/tile · title • subtitle ………… tag (or ↵ when highlighted). */
export function ResultRow({ item, query, id, active, onHover, onOpen }) {
  const lead = item.kind === 'person'
    ? <Avatar name={item.title} size="size-8" />
    : <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-muted"><Icon name={KIND_ICON[item.kind] ?? 'home'} className="size-4" /></span>;
  return (
    <button
      id={id} type="button" role="option" aria-selected={active} onMouseMove={onHover} onClick={onOpen}
      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm', active && 'bg-surface-2')}
    >
      {lead}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate font-medium text-ink"><Highlight text={item.title} query={query} /></span>
        {item.subtitle && <><span aria-hidden="true" className="text-muted">•</span><span className="truncate text-muted">{item.subtitle}</span></>}
      </span>
      {active
        ? <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted"><Icon name="chevron-right" className="size-3.5" /></span>
        : item.tag && <span className="max-w-40 shrink-0 truncate text-sm text-muted">{item.tag}</span>}
    </button>
  );
}

/** Pill filter (People, Accounts …) — same look as the reference chips. */
export const FilterChip = ({ selected, children, ...rest }) => (
  <button
    type="button" aria-pressed={selected} {...rest}
    className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', selected ? 'border-line bg-surface-2 font-medium text-ink' : 'border-line text-muted hover:bg-surface-2 hover:text-ink')}
  >{children}</button>
);

/** Soft grid fading out at the edges with three tilted tiles on it — the "nothing found" picture. */
function EmptyArt() {
  const grid = 'linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)';
  const fade = 'radial-gradient(circle at center, #000 25%, transparent 70%)';
  const tile = 'grid size-12 place-items-center rounded-xl border border-line bg-surface text-muted';
  return (
    <div className="relative mb-4 grid h-36 w-60 place-items-center">
      <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: grid, backgroundSize: '20px 20px', maskImage: fade, WebkitMaskImage: fade }} />
      <div className="relative flex items-center">
        <span className={cn(tile, '-mr-2 -rotate-6')}><Icon name="user" className="size-5" /></span>
        <span className={cn(tile, 'z-10 size-14 text-ink')}><Icon name="search" className="size-6" /></span>
        <span className={cn(tile, '-ml-2 rotate-6')}><Icon name="sliders" className="size-5" /></span>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, onClear }) {
  return (
    <div className="flex flex-col items-center px-6 pb-8 pt-6 text-center">
      <EmptyArt />
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>
      <Button size="sm" variant="neutral" className="mt-4" onClick={onClear}>Clear filters</Button>
    </div>
  );
}

const Hint = ({ keys, children }) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap">
    <span className="flex items-center gap-1">{keys.map((k) => <Kbd key={k} className="grid h-5 min-w-5 place-items-center rounded border-line bg-surface px-1 text-[10px] opacity-100">{k}</Kbd>)}</span>{children}
  </span>
);

export const Footer = () => (
  <footer className="flex items-center gap-3.5 overflow-hidden border-t border-line bg-surface-2/60 px-4 py-2.5 text-xs text-muted">
    <Hint keys={['↑', '↓']}>Select</Hint>
    <Hint keys={['↵']}>Open</Hint>
    <span className="hidden items-center gap-4 sm:flex">
      <Hint keys={[MOD_KEY, '↵']}>New tab</Hint>
      <Hint keys={[MOD_KEY, '⇧', 'L']}>Copy link</Hint>
    </span>
    <Hint keys={['Esc']}>Close</Hint>
  </footer>
);
