import { DocumentColorIcon, FolderColorIcon } from '../components/ui/ColorIcons.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Kbd, MOD_KEY } from '../components/ui/Kbd.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/DropdownMenu.jsx';
import { cn } from '../lib/cn.js';
import { initials } from '../lib/format.js';
import { hueOf } from '../lib/hue.js';
import { chipVisual, visualFor } from '../lib/searchVisuals.js';

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
  const v = visualFor(item);
  const lead = v.type === 'person'
    ? <span style={{ '--h': hueOf(item.title) }} className="tint-solid grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold" aria-hidden="true">{initials(item.title)}</span>
    : v.type === 'document' || v.type === 'folder'
      ? <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface" aria-hidden="true">{v.type === 'folder' ? <FolderColorIcon color={v.color} className="size-5" /> : <DocumentColorIcon color={v.color} className="size-5" />}</span>
      : <span style={{ '--h': v.hue }} className="tint grid size-8 shrink-0 place-items-center rounded-lg border" aria-hidden="true"><Icon name={v.icon} className="size-4" /></span>;
  return (
    <button
      id={id} type="button" role="option" aria-selected={active} onMouseMove={onHover} onClick={onOpen}
      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', active && 'bg-surface-2')}
    >
      {lead}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate font-medium text-ink"><Highlight text={item.title} query={query} /></span>
        {item.subtitle && <><span aria-hidden="true" className="text-muted">•</span><span className="truncate text-muted">{item.subtitle}</span></>}
      </span>
      {active
        ? <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line-strong bg-surface text-muted"><Icon name="chevron-right" className="size-3.5" /></span>
        : item.tag && <Badge>{item.tag}</Badge>}
    </button>
  );
}

/** Outlined chip with a coloured icon and a count ("Accounts 3") — the reference's content-type chips, Untitled UI's Tags › Count. */
export function FilterChip({ label, selected, count, ...rest }) {
  const { icon, hue } = chipVisual(label);
  return (
    <button
      type="button" aria-pressed={selected} {...rest}
      className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', selected ? 'border-accent/40 bg-accent-soft text-link' : 'border-line-strong text-ink hover:bg-surface-2')}
    >
      <span style={{ '--h': hue }} className="tint-text" aria-hidden="true"><Icon name={icon} className="size-3.5" /></span>
      {label}
      {count != null && <span className={cn('rounded px-1 text-[11px] leading-4 tabular-nums', selected ? 'bg-accent/15 text-link' : 'bg-surface-2 text-muted')}>{count}</span>}
    </button>
  );
}

/** Round 28px icon button that opens a small menu (filter / sort), like the two round buttons in the reference. A dot shows it is active. */
function RoundMenu({ icon, label, active, children }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" aria-label={label} title={label} {...props} className={cn('relative grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring', active && 'bg-surface-2 text-ink')}>
            <Icon name={icon} className="size-3.5" />
            {active && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-surface bg-accent" />}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

const Choice = ({ selected, onSelect, children }) => (
  <DropdownMenuItem onSelect={onSelect}>{children}{selected && <Icon name="check" className="ml-auto size-4 text-link" />}</DropdownMenuItem>
);

/** Filter button: pick one kind to show (the same kinds as the chips) or clear. */
export function FilterMenu({ options, value, onChange }) {
  return (
    <RoundMenu icon="filter" label={value ? `Filter: ${value}` : 'Filter'} active={Boolean(value)}>
      <DropdownMenuLabel>Show only</DropdownMenuLabel>
      {options.map((o) => <Choice key={o} selected={o === value} onSelect={() => onChange(o === value ? null : o)}>{o}</Choice>)}
      {value && <><DropdownMenuSeparator /><DropdownMenuItem icon="x" onSelect={() => onChange(null)}>Clear filter</DropdownMenuItem></>}
    </RoundMenu>
  );
}

/** Sort button: relevance (the server's order) or name A–Z. */
export function SortMenu({ value, onChange }) {
  return (
    <RoundMenu icon="sort" label={value === 'name' ? 'Sorted by name' : 'Sort'} active={value !== 'relevance'}>
      <DropdownMenuLabel>Sort by</DropdownMenuLabel>
      <Choice selected={value === 'relevance'} onSelect={() => onChange('relevance')}>Relevance</Choice>
      <Choice selected={value === 'name'} onSelect={() => onChange('name')}>Name (A–Z)</Choice>
    </RoundMenu>
  );
}

/**
 * "Nothing found" pictures from Untitled UI's Empty states: Avatar row (people) — a row of faded avatars around a search tile — and
 * File icon (everything else) — a soft circle with a document-search icon — each on a faint grid that fades out at the edges.
 */
function EmptyArt({ variant }) {
  const grid = 'linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)';
  const fade = 'radial-gradient(circle at center, #000 25%, transparent 70%)';
  return (
    <div className="relative mb-3 grid h-28 w-64 place-items-center">
      <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: grid, backgroundSize: '18px 18px', maskImage: fade, WebkitMaskImage: fade }} />
      {variant === 'people' ? (
        <div className="relative flex items-center gap-2" aria-hidden="true">
          {[0.25, 0.5, 0.8].map((o) => <span key={o} className="grid size-9 place-items-center rounded-full bg-accent-soft text-link" style={{ opacity: o }}><Icon name="user" className="size-4" /></span>)}
          <span className="grid size-12 place-items-center rounded-xl border border-line-strong bg-surface text-muted"><Icon name="search" className="size-5" /></span>
          {[0.8, 0.5, 0.25].map((o) => <span key={o} className="grid size-9 place-items-center rounded-full bg-accent-soft text-link" style={{ opacity: o }}><Icon name="user" className="size-4" /></span>)}
        </div>
      ) : (
        <span aria-hidden="true" className="relative grid size-16 place-items-center rounded-full border border-line bg-surface-2 text-link"><Icon name="file-search" className="size-7" /></span>
      )}
    </div>
  );
}

export function EmptyState({ variant = 'generic', title, hint, filtered, onClearSearch, onClearFilters }) {
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-4 text-center">
      <EmptyArt variant={variant} />
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{hint}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="neutral" onClick={onClearSearch}>Clear search</Button>
        {filtered && <Button size="sm" variant="neutral" onClick={onClearFilters}>Clear filters</Button>}
      </div>
    </div>
  );
}

const Hint = ({ keys, children }) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap">
    <span className="flex items-center gap-1">{keys.map((k, i) => <Kbd key={typeof k === 'string' ? k : i} className="grid h-5 min-w-5 place-items-center rounded border-line bg-surface px-1 text-[10px] opacity-100">{k}</Kbd>)}</span>{children}
  </span>
);

export const Footer = () => (
  <footer className="flex items-center gap-3.5 overflow-hidden border-t border-line bg-surface-2/60 px-4 py-2 text-xs text-muted">
    <Hint keys={[<Icon key="u" name="arrow-up" className="size-3" />, <Icon key="d" name="arrow-down" className="size-3" />]}>Select</Hint>
    <Hint keys={[<Icon key="e" name="corner-down-left" className="size-3" />]}>Open</Hint>
    <span className="hidden items-center gap-4 sm:flex">
      <Hint keys={[MOD_KEY, <Icon key="e" name="corner-down-left" className="size-3" />]}>New tab</Hint>
      <Hint keys={[MOD_KEY, 'Shift', 'L']}>Copy link</Hint>
    </span>
    <Hint keys={['Esc']}>Close</Hint>
  </footer>
);
