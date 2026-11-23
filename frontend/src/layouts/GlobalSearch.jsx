import { hasRole } from '@app/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { AppsColorIcon, CompassColorIcon, DocumentColorIcon, RecordsColorIcon } from '../components/ui/ColorIcons.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { useGlobalSearch } from '../hooks/useGlobalSearch.js';
import { readRecent, rememberRecent } from '../lib/recentSearch.js';
import { NAV_ITEMS } from './navigation.js';
import { EmptyState, FilterChip, FilterMenu, Footer, ResultRow, SectionLabel, SortMenu } from './GlobalSearchParts.jsx';
import { useSearch } from './SearchContext.jsx';

const GROUP_TITLES = { pages: 'Pages', navigation: 'Setup', records: 'Records', people: 'People', documents: 'Documents' };
const GROUP_ORDER = ['pages', 'navigation', 'records', 'people', 'documents'];
/** Which result groups each tab shows (Records includes the workspace's people). */
const SCOPE_GROUPS = { all: GROUP_ORDER, navigation: ['pages', 'navigation'], records: ['records', 'people'], documents: ['documents'] };
const FILTER_BY_TAB = {
  all: (item) => ({ record: 'Records', person: 'People', document: 'Documents' }[item.kind] ?? 'Navigation'),
  navigation: (item) => (item.kind === 'page' ? (item.tag === 'Page' ? 'Pages' : 'Setup pages') : item.kind === 'setting' ? 'Settings' : 'Configuration'),
  records: (item) => (item.kind === 'person' ? 'People' : item.tag),
  documents: (item) => item.tag,
};
const QUICK_ACTIONS = 5;

/**
 * Global search (Ctrl/⌘ K). Navigation pages are matched instantly in the browser; records, people, Setup and documents come from
 * one server endpoint (permission-aware, indexed). ↑↓ move, Enter opens, ⌘/Ctrl+Enter opens in a new tab, ⌘/Ctrl+⇧+L copies the link,
 * Esc closes. Colourful tabs choose the scope (All · Navigation · Records · Documents); chips with counts narrow within it, the round buttons
 * filter and sort. Without a query: recent results and quick actions.
 */
export function GlobalSearch() {
  const { open, close } = useSearch();
  const { activeWorkspace } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(activeWorkspace && hasRole(activeWorkspace.role, 'admin'));
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [chip, setChip] = useState(null);
  const [sort, setSort] = useState('relevance');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState([]);
  const list = useRef(null);
  const input = useRef(null);

  useEffect(() => { if (open) { setQuery(''); setType('all'); setChip(null); setSort('relevance'); setActive(0); setRecent(readRecent()); } }, [open]);

  const server = useGlobalSearch(query, type, open);
  const needle = query.trim().toLowerCase();
  const searching = needle.length >= 2;
  const toItem = (i) => ({ id: `nav:${i.to}`, kind: 'page', title: i.label, subtitle: '', tag: 'Page', to: i.to });
  const navItems = useMemo(() => NAV_ITEMS.filter((i) => !i.minRole || isAdmin), [isAdmin]);
  const localPages = useMemo(() => navItems.filter((i) => !needle || i.label.toLowerCase().includes(needle)).map(toItem), [navItems, needle]);

  // Results of the current tab (before the chip filter): the local pages plus the server's groups for this scope.
  const scopeGroups = useMemo(() => {
    const out = {};
    for (const key of SCOPE_GROUPS[type]) {
      const items = key === 'pages' ? localPages.slice(0, type === 'all' ? 4 : 20) : server.groups[key];
      if (items?.length) out[key] = items;
    }
    return out;
  }, [type, localPages, server.groups]);
  const kindOf = FILTER_BY_TAB[type];
  const chips = useMemo(() => {
    const counts = new Map();
    for (const item of Object.values(scopeGroups).flat()) counts.set(kindOf(item), (counts.get(kindOf(item)) ?? 0) + 1);
    return [...counts];
  }, [scopeGroups, kindOf]);
  const activeChip = chips.some(([name]) => name === chip) ? chip : null;

  const groups = useMemo(() => {
    if (!searching) {
      return [recent.length && ['recent', recent], ['actions', navItems.slice(0, QUICK_ACTIONS).map(toItem)]].filter(Boolean);
    }
    const order = (items) => (sort === 'name' ? [...items].sort((x, y) => x.title.localeCompare(y.title)) : items);
    return GROUP_ORDER.filter((key) => scopeGroups[key]).map((key) => [key, order(activeChip ? scopeGroups[key].filter((item) => kindOf(item) === activeChip) : scopeGroups[key])]).filter(([, items]) => items.length);
  }, [searching, recent, navItems, scopeGroups, activeChip, kindOf, sort]);
  const flat = groups.flatMap(([, items]) => items);

  useEffect(() => setActive(0), [query, type, activeChip]);
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

  const tabs = [
    { id: 'all', label: 'All', iconNode: <AppsColorIcon /> },
    { id: 'navigation', label: 'Navigation', iconNode: <CompassColorIcon /> },
    { id: 'records', label: 'Records', iconNode: <RecordsColorIcon /> },
    ...(isAdmin ? [{ id: 'documents', label: 'Documents', iconNode: <DocumentColorIcon /> }] : []),
  ];
  const nothing = searching && !flat.length && !server.loading && (type === 'navigation' ? server.searched || !isAdmin : server.searched);
  const filtered = Boolean(activeChip);
  const clear = () => { setChip(null); input.current?.focus(); };
  const label = { recent: 'Recent', actions: 'Quick actions', ...GROUP_TITLES };

  return (
    <Dialog open={open} onClose={close} label="Search" className="max-w-[660px] rounded-2xl">
      <div className="flex items-center gap-3 px-4">
        <Icon name="search" className="size-[18px] shrink-0 text-muted" />
        <input
          ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} role="combobox" aria-expanded aria-controls="global-search-results" aria-activedescendant={flat[active] ? `gs-${active}` : undefined}
          placeholder="Start typing here…" aria-label="Search" autoComplete="off" spellCheck={false}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
        {server.loading && <Spinner className="size-4 text-muted" />}
        {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); input.current?.focus(); }} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><Icon name="x" className="size-4" /></button>}
        <button type="button" aria-label="Close search" onClick={close} className="hidden h-6 shrink-0 items-center rounded-md border border-line px-1.5 text-[10px] font-medium text-muted hover:bg-surface-2 hover:text-ink sm:flex">Esc</button>
      </div>

      <Tabs tabs={tabs} value={type} onChange={(id) => { setType(id); setChip(null); input.current?.focus(); }} label="Search in" className="overflow-x-auto border-t px-2" />

      {searching && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {chips.map(([name, count]) => <FilterChip key={name} label={name} count={count} selected={name === activeChip} onClick={() => { setChip(name === activeChip ? null : name); input.current?.focus(); }} />)}
          </div>
          <FilterMenu options={chips.map(([name]) => name)} value={activeChip} onChange={setChip} />
          <SortMenu value={sort} onChange={setSort} />
        </div>
      )}

      <div ref={list} id="global-search-results" role="listbox" aria-label="Results" className="h-[min(46vh,330px)] overflow-y-auto px-2 pb-2">
        {nothing ? <EmptyState variant={type === 'records' ? 'people' : 'generic'} title="No matches found" hint={`We couldn’t find anything matching “${query.trim()}”. Try adjusting your keywords, filters, or check for typos.`} filtered={filtered} onClearSearch={() => { setQuery(''); input.current?.focus(); }} onClearFilters={clear} /> : (() => {
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
