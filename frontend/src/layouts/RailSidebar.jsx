import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Kbd, searchShortcutLabel } from '../components/ui/Kbd.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Tooltip } from '../components/ui/Tooltip.jsx';
import { WorkspaceSwitcherLogo } from '../components/workspace/WorkspaceSwitcher.jsx';
import { useLocalStorageState } from '../hooks/useLocalStorageState.js';
import { cn } from '../lib/cn.js';
import { isVisibleTo } from './NavMain.jsx';
import { NAV } from './navigation.js';
import { NavUserCompact } from './NavUser.jsx';
import { useSearch } from './SearchContext.jsx';

const RECENT_MAX = 6;
const matches = (item, pathname) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));

/** navigation.js → rail sections (the unnamed top-level rows are "Overview", then one section per group). Role-hidden items are dropped. */
function useSections() {
  const { activeWorkspace } = useAuth();
  return useMemo(() => {
    const show = (items) => items.filter((item) => isVisibleTo(item, activeWorkspace));
    return [{ id: 'overview', label: 'Overview', icon: 'home', items: show(NAV.main) }, ...NAV.groups.map((g) => ({ id: g.label, label: g.label, icon: g.icon, items: show(g.items) }))]
      .filter((section) => section.items.length);
  }, [activeWorkspace]);
}

/** 40px square icon on the rail: a link (active = tinted tile) or a button. */
const RAIL_ICON = 'grid size-10 place-items-center rounded-lg text-muted outline-none transition-colors hover:bg-line/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring';
function RailLink({ to, end, icon, label, active }) {
  return (
    <Tooltip label={label}>
      <NavLink to={to} end={end} aria-label={label} className={({ isActive }) => cn(RAIL_ICON, (active ?? isActive) && 'bg-line text-ink')}><Icon name={icon} className="size-5" /></NavLink>
    </Tooltip>
  );
}
function RailButton({ icon, label, onClick }) {
  return <Tooltip label={label}><button type="button" aria-label={label} onClick={onClick} className={RAIL_ICON}><Icon name={icon} className="size-5" /></button></Tooltip>;
}

/** Panel row: 40px, icon + label, active = tinted. */
const ROW = 'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring';
function PanelRow({ item }) {
  return (
    <li>
      <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ROW, isActive && 'bg-sidebar-accent')}>
        <Icon name={item.icon} className="size-5 shrink-0 text-sidebar-muted" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge != null && <span className="rounded-md bg-sidebar-accent px-1.5 text-xs leading-5 text-sidebar-muted">{item.badge}</span>}
      </NavLink>
    </li>
  );
}

function SearchField() {
  const { show } = useSearch();
  return (
    <button type="button" onClick={show} className="flex h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm text-placeholder outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-ring">
      <Icon name="search" className="size-4 shrink-0" />
      <span className="flex-1 text-left">Search</span>
      <Kbd className="border-line-strong text-muted opacity-100">{searchShortcutLabel()}</Kbd>
    </button>
  );
}

/** Section panel: title, search, Menu | Recent tabs and the section's rows. */
function Panel({ section, sections }) {
  const { toggle } = useSidebar();
  const { pathname } = useLocation();
  const [tab, setTab] = useState('menu');
  const [recent, setRecent] = useLocalStorageState('nav:recent', []);
  const all = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    const here = all.find((item) => matches(item, pathname));
    if (here) setRecent((list) => [here.to, ...list.filter((to) => to !== here.to)].slice(0, RECENT_MAX));
  }, [pathname, all, setRecent]);
  const recentItems = recent.map((to) => all.find((item) => item.to === to)).filter(Boolean);
  const items = tab === 'recent' ? recentItems : section.items;

  return (
    <div className="flex w-70 min-w-0 flex-col gap-4 border-r border-sidebar-line bg-sidebar px-4 pb-4 pt-5">
      <div className="flex h-8 items-center justify-between gap-2">
        <h2 className="truncate text-lg font-semibold text-sidebar-ink">{section.label}</h2>
        <button type="button" aria-label="Hide panel" onClick={toggle} className="grid size-8 place-items-center rounded-lg text-sidebar-muted outline-none hover:bg-sidebar-accent hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-ring"><Icon name="panel-left" className="size-5" /></button>
      </div>
      <SearchField />
      <Tabs label="Navigation" value={tab} onChange={setTab} tabs={[{ id: 'menu', label: 'Menu' }, { id: 'recent', label: 'Recent' }]} />
      <nav aria-label={section.label} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <ul className="flex flex-col gap-0.5">{items.map((item) => <PanelRow key={item.to} item={item} />)}</ul>
        {!items.length && <p className="px-3 py-2 text-sm text-sidebar-muted">Pages you open will show up here.</p>}
      </nav>
    </div>
  );
}

/**
 * Default desktop navigation: a 72px icon rail (workspace mark, one icon per section, Setup, search, panel toggle, account) and a
 * 280px panel with the current section's pages. Both read navigation.js. Hidden panel (⌘B) leaves just the rail; pages outside any
 * section (Setup has its own tree) show the rail only. Phones use the drawer sidebar instead.
 */
export function RailSidebar() {
  const sections = useSections();
  const { pathname } = useLocation();
  const { variant, collapsed, toggle } = useSidebar();
  const { show: showSearch } = useSearch();
  const { activeWorkspace } = useAuth();
  const bottom = NAV.bottom.filter((item) => isVisibleTo(item, activeWorkspace));
  const current = sections.find((s) => s.items.some((item) => matches(item, pathname)));

  return (
    <aside aria-label="Application" className={cn('flex h-full shrink-0', variant === 'floating' && 'm-2 mr-0 overflow-hidden rounded-xl border border-sidebar-line')}>
      <div className="flex w-18 shrink-0 flex-col items-center gap-1 border-r border-sidebar-line bg-rail py-4 text-sidebar-ink">
        <div className="mb-3"><WorkspaceSwitcherLogo compact /></div>
        <nav aria-label="Sections" className="flex flex-col items-center gap-1">
          {sections.map((s) => <RailLink key={s.id} to={s.items[0].to} end={s.items[0].end} icon={s.icon} label={s.label} active={s === current} />)}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1">
          {bottom.map((item) => <RailLink key={item.to} to={item.to} icon={item.icon} label={item.label} active={matches({ ...item, end: !item.prefix }, pathname)} />)}
          <RailButton icon="search" label="Search" onClick={showSearch} />
          {current && <RailButton icon="panel-left" label={collapsed ? 'Show panel' : 'Hide panel'} onClick={toggle} />}
          <div className="mt-2"><NavUserCompact side="right" align="end" /></div>
        </div>
      </div>
      {current && !collapsed && <Panel section={current} sections={sections} />}
    </aside>
  );
}
