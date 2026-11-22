import { hasRole } from '@app/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { useGlobalSearch } from '../hooks/useGlobalSearch.js';
import { readRecent, rememberRecent } from '../lib/recentSearch.js';
import { NAV_ITEMS } from './navigation.js';
import { EmptyState, FilterChip, Footer, ResultRow, SectionLabel } from './GlobalSearchParts.jsx';
import { useSearch } from './SearchContext.jsx';

const GROUP_TITLES = { pages: 'Pages', records: 'Records', people: 'People', setup: 'Setup' };
const GROUP_ORDER = ['pages', 'records', 'people', 'setup'];
const QUICK_ACTIONS = 5;

/**
 * Global search (Ctrl/⌘ K). Navigation pages are matched instantly in the browser; records, people and Setup come from
 * one server endpoint (permission-aware, indexed). ↑↓ move, Enter opens, ⌘/Ctrl+Enter opens in a new tab, ⌘/Ctrl+⇧+L copies the link,
 * Esc closes. Tabs choose the scope; chips narrow the records by object. Without a query: recent results and quick actions.
 */
export function GlobalSearch() {
  const { open, close } = useSearch();
  const { activeWorkspace } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(activeWorkspace && hasRole(activeWorkspace.role, 'admin'));
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [tag, setTag] = useState(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState([]);
  const list = useRef(null);
  const input = useRef(null);

  useEffect(() => { if (open) { setQuery(''); setType('all'); setTag(null); setActive(0); setRecent(readRecent()); } }, [open]);

  const server = useGlobalSearch(query, type, open);
  const needle = query.trim().toLowerCase();
  const searching = needle.length >= 2;
  const toItem = (i) => ({ id: `nav:${i.to}`, kind: 'page', title: i.label, subtitle: '', tag: 'Page', to: i.to });
  const navItems = useMemo(() => NAV_ITEMS.filter((i) => !i.minRole || isAdmin), [isAdmin]);
  const localPages = useMemo(() => navItems.filter((i) => !needle || i.label.toLowerCase().includes(needle)).map(toItem), [navItems, needle]);

  const tags = useMemo(() => [...new Set((server.groups.records ?? []).map((r) => r.tag).filter(Boolean))], [server.groups.records]);
  const activeTag = tags.includes(tag) ? tag : null;

  const groups = useMemo(() => {
    if (!searching) {
      return [recent.length && ['recent', recent], ['actions', navItems.slice(0, QUICK_ACTIONS).map(toItem)]].filter(Boolean);
    }
    const out = {};
    if (type === 'all' || type === 'pages') out.pages = localPages.slice(0, type === 'pages' ? 20 : 4);
    for (const key of ['records', 'people', 'setup']) {
      let items = server.groups[key];
      if (key === 'records' && activeTag) items = items?.filter((r) => r.tag === activeTag);
      if (items?.length && (type === 'all' || type === key)) out[key] = items;
    }
    return GROUP_ORDER.filter((k) => out[k]?.length).map((k) => [k, out[k]]);
  }, [searching, recent, navItems, type, localPages, server.groups, activeTag]);
  const flat = groups.flatMap(([, items]) => items);

  useEffect(() => setActive(0), [query, type, activeTag]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, flat.length]);

  const go = (item, { newTab = false } = {}) => {
    rememberRecent(item);
    if (newTab) { window.open(item.to, '_blank', 'noopener'); return; }
    close(); navigate(item.to);
  };
  const copyLink = (item) => { try { navigator.clipboard?.writeText(new URL(item.to, window.location.origin).href); } catch { /* clipboard unavailable */ } };
  const onKeyDown = (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter' && flat[active]) { event.preventDefault(); go(flat[active], { newTab: mod }); }
    else if (mod && event.shiftKey && event.key.toLowerCase() === 'l' && flat[active]) { event.preventDefault(); copyLink(flat[active]); }
  };

  const tabs = [{ id: 'all', label: 'All', icon: 'search' }, { id: 'records', label: 'Records', icon: 'users' }, { id: 'people', label: 'People', icon: 'user' }, { id: 'pages', label: 'Pages', icon: 'home' }, ...(isAdmin ? [{ id: 'setup', label: 'Setup', icon: 'sliders' }] : [])];
  const nothing = searching && !flat.length && !server.loading && (type === 'pages' || server.searched);
  const filtered = type !== 'all' || Boolean(activeTag);
  const clear = () => { setType('all'); setTag(null); input.current?.focus(); };
  const label = { recent: 'Recent', actions: 'Quick actions', ...GROUP_TITLES };

  return (
    <Dialog open={open} onClose={close} label="Search" className="max-w-[740px] rounded-2xl">
      <div className="flex items-center gap-3 px-5">
        <Icon name="search" className="size-5 shrink-0 text-muted" />
        <input
          ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} role="combobox" aria-expanded aria-controls="global-search-results" aria-activedescendant={flat[active] ? `gs-${active}` : undefined}
          placeholder="Start typing here…" aria-label="Search" autoComplete="off" spellCheck={false}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
        {server.loading && <Spinner className="size-4 text-muted" />}
        {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); input.current?.focus(); }} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><Icon name="x" className="size-4" /></button>}
        <button type="button" aria-label="Close search" onClick={close} className="hidden h-6 shrink-0 items-center rounded-md border border-line px-1.5 text-[10px] font-medium text-muted hover:bg-surface-2 hover:text-ink sm:flex">Esc</button>
      </div>

      <Tabs tabs={tabs} value={type} onChange={(id) => { setType(id); setTag(null); input.current?.focus(); }} label="Search in" className="overflow-x-auto border-t px-3" />

      {searching && tags.length > 1 && (type === 'all' || type === 'records') && (
        <div className="flex gap-2 overflow-x-auto border-b border-line px-5 py-2.5">
          {tags.map((t) => <FilterChip key={t} selected={t === activeTag} onClick={() => { setTag(t === activeTag ? null : t); input.current?.focus(); }}>{t}</FilterChip>)}
        </div>
      )}

      <div ref={list} id="global-search-results" role="listbox" aria-label="Results" className="h-[min(50vh,380px)] overflow-y-auto px-2 pb-2">
        {nothing ? <EmptyState title="No matches found" hint="We couldn’t find anything matching your search. Try adjusting your keywords, filters, or check for typos." onClear={filtered ? clear : () => setQuery('')} /> : (() => {
          let index = -1;
          return groups.map(([key, items]) => (
            <div key={key}>
              <SectionLabel count={items.length}>{label[key]}</SectionLabel>
              {items.map((item) => {
                index += 1;
                const i = index;
                return <ResultRow key={`${key}:${item.id}`} item={item} query={searching ? needle : ''} id={`gs-${i}`} active={i === active} onHover={() => setActive(i)} onOpen={() => go(item)} />;
              })}
            </div>
          ));
        })()}
        {server.partial && <p className="px-3 py-2 text-xs text-muted">Some results took too long and were left out. Refine your search to see more.</p>}
      </div>

      <Footer />
    </Dialog>
  );
}
