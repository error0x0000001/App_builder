import { hasRole } from '@app/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Kbd } from '../components/ui/Kbd.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { useGlobalSearch } from '../hooks/useGlobalSearch.js';
import { cn } from '../lib/cn.js';
import { NAV_ITEMS } from './navigation.js';
import { useSearch } from './SearchContext.jsx';

const KIND_ICON = { page: 'home', record: 'users', person: 'user', setting: 'sliders', config: 'sliders' };
const GROUP_TITLES = { pages: 'Pages', records: 'Records', people: 'People', setup: 'Setup' };
const GROUP_ORDER = ['pages', 'records', 'people', 'setup'];

/** The matched part of a title in bold. */
function Highlight({ text, query }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-transparent font-semibold text-ink">{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

function EmptyState({ query, filtered, onClear }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-surface-2 text-muted"><Icon name="search" className="size-6" /></span>
      <p className="text-sm font-semibold text-ink">No results for “{query}”</p>
      <p className="mt-1 max-w-xs text-sm text-muted">We couldn’t find anything matching your search. Try different keywords{filtered ? ' or clear the filter' : ''}.</p>
      <Button size="sm" variant="neutral" className="mt-4" onClick={onClear}>{filtered ? 'Clear filters' : 'Clear search'}</Button>
    </div>
  );
}

/**
 * Global search (Ctrl/⌘ K). Navigation pages are matched instantly in the browser; records, people and Setup come from
 * one server endpoint (permission-aware, indexed). Arrow keys move, Enter opens, Esc closes. Filter chips narrow the kind.
 */
export function GlobalSearch() {
  const { open, close } = useSearch();
  const { activeWorkspace } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(activeWorkspace && hasRole(activeWorkspace.role, 'admin'));
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [active, setActive] = useState(0);
  const list = useRef(null);
  const input = useRef(null);

  useEffect(() => { if (open) { setQuery(''); setType('all'); setActive(0); } }, [open]);

  const server = useGlobalSearch(query, type, open);
  const needle = query.trim().toLowerCase();
  const localPages = useMemo(() => NAV_ITEMS.filter((i) => (!i.minRole || isAdmin) && (!needle || i.label.toLowerCase().includes(needle)))
    .map((i) => ({ id: `nav:${i.to}`, kind: 'page', title: i.label, subtitle: 'Navigation', to: i.to })), [needle, isAdmin]);

  const groups = useMemo(() => {
    const out = {};
    if (type === 'all' || type === 'pages') out.pages = localPages.slice(0, type === 'pages' ? 20 : 4);
    for (const key of ['records', 'people', 'setup']) if (server.groups[key]?.length && (type === 'all' || type === key)) out[key] = server.groups[key];
    return GROUP_ORDER.filter((k) => out[k]?.length).map((k) => [k, out[k]]);
  }, [type, localPages, server.groups]);
  const flat = groups.flatMap(([, items]) => items);

  useEffect(() => setActive(0), [query, type]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, flat.length]);

  const go = (item) => { close(); navigate(item.to); };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter' && flat[active]) { event.preventDefault(); go(flat[active]); }
  };

  const chips = [{ id: 'all', label: 'All' }, { id: 'pages', label: 'Pages' }, { id: 'records', label: 'Records' }, { id: 'people', label: 'People' }, ...(isAdmin ? [{ id: 'setup', label: 'Setup' }] : [])];
  const searching = needle.length >= 2;
  const nothing = searching && !flat.length && !server.loading && (type === 'pages' || server.searched);

  return (
    <Dialog open={open} onClose={close} label="Search" className="max-w-2xl">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Icon name="search" className="size-4 shrink-0 text-muted" />
        <input
          ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} role="combobox" aria-expanded aria-controls="global-search-results" aria-activedescendant={flat[active] ? `gs-${active}` : undefined}
          placeholder="Search records, people, pages and settings…" aria-label="Search" autoComplete="off" spellCheck={false}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {server.loading && <Spinner className="size-4 text-muted" />}
        <button type="button" aria-label="Close search" onClick={close} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><Icon name="x" className="size-4" /></button>
      </div>

      <div role="tablist" aria-label="Filter results" className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5">
        {chips.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={type === c.id} onClick={() => { setType(c.id); input.current?.focus(); }} className={cn('h-8 shrink-0 rounded-lg border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', type === c.id ? 'border-line bg-surface-2 font-medium text-ink' : 'border-transparent text-muted hover:bg-surface-2 hover:text-ink')}>{c.label}</button>
        ))}
      </div>

      <div ref={list} id="global-search-results" role="listbox" aria-label="Results" className="max-h-[50vh] min-h-48 overflow-y-auto p-2">
        {!searching && !flat.length && <p className="px-3 py-10 text-center text-sm text-muted">Type at least 2 characters to search everything you have access to.</p>}
        {nothing ? <EmptyState query={query.trim()} filtered={type !== 'all'} onClear={() => (type !== 'all' ? setType('all') : setQuery(''))} /> : (() => {
          let index = -1;
          return groups.map(([key, items]) => (
            <div key={key} className="mb-1">
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{GROUP_TITLES[key]}</p>
              {items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <button
                    key={item.id} id={`gs-${i}`} type="button" role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => go(item)}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === active && 'bg-surface-2')}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted"><Icon name={KIND_ICON[item.kind] ?? 'home'} className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink"><Highlight text={item.title} query={needle} /></span>
                      {item.subtitle && <span className="block truncate text-xs text-muted">{item.subtitle}</span>}
                    </span>
                    {i === active && <Icon name="chevron-right" className="size-4 shrink-0 text-muted" />}
                  </button>
                );
              })}
            </div>
          ));
        })()}
        {server.partial && <p className="px-3 py-2 text-xs text-muted">Some results took too long and were left out. Refine your search to see more.</p>}
      </div>

      <footer className="flex items-center gap-4 border-t border-line bg-surface-2/60 px-4 py-2.5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><Kbd>↵</Kbd>Open</span>
        <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>Navigate</span>
        <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd>Close</span>
      </footer>
    </Dialog>
  );
}
