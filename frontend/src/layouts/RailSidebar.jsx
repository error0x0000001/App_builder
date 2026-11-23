import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Tooltip } from '../components/ui/Tooltip.jsx';
import { WorkspaceSwitcherLogo } from '../components/workspace/WorkspaceSwitcher.jsx';
import { useLocalStorageState } from '../hooks/useLocalStorageState.js';
import { cn } from '../lib/cn.js';
import { NavRows, ROW_ACTION, SearchField, useNavSections } from './NavRows.jsx';
import { isActivePath, isVisibleTo, NAV } from './navigation.js';
import { NavUserCompact } from './NavUser.jsx';
import { useSearch } from './SearchContext.jsx';

const RECENT_MAX = 6;

/** 44px tile on the rail holding a 22px icon: a link (active = tinted tile) or a button. */
const RAIL_ICON = 'grid size-11 place-items-center rounded-xl text-sidebar-ink outline-none transition-colors hover:bg-line/70 focus-visible:ring-2 focus-visible:ring-ring';
function RailLink({ to, end, icon, label, active }) {
  return (
    <Tooltip label={label}>
      <NavLink to={to} end={end} aria-label={label} className={({ isActive }) => cn(RAIL_ICON, (active ?? isActive) && 'bg-line')}><Icon name={icon} className="size-5.5" /></NavLink>
    </Tooltip>
  );
}
function RailButton({ icon, label, onClick }) {
  return <Tooltip label={label}><button type="button" aria-label={label} onClick={onClick} className={RAIL_ICON}><Icon name={icon} className="size-5.5" /></button></Tooltip>;
}

/** Section panel: title, search, Menu | Recent tabs and the section's rows. */
function Panel({ section, sections }) {
  const { toggle } = useSidebar();
  const { pathname } = useLocation();
  const [tab, setTab] = useState('menu');
  const [recent, setRecent] = useLocalStorageState('nav:recent', []);
  const all = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    const here = all.find((item) => isActivePath(item, pathname));
    if (here) setRecent((list) => [here.to, ...list.filter((to) => to !== here.to)].slice(0, RECENT_MAX));
  }, [pathname, all, setRecent]);
  const recentItems = recent.map((to) => all.find((item) => item.to === to)).filter(Boolean).map(({ parent, ...item }) => item);
  const items = tab === 'recent' ? recentItems : section.items;

  return (
    <div className="flex min-h-0 w-75 min-w-0 flex-col gap-5 px-5 pb-4 pt-7">
      <div className="flex h-9 items-center justify-between gap-2 px-1">
        <h2 className="truncate text-xl font-semibold text-sidebar-ink">{section.label}</h2>
        <button type="button" aria-label="Hide panel" onClick={toggle} className={ROW_ACTION}><Icon name="panel-left" className="size-5" /></button>
      </div>
      <SearchField />
      <Tabs tone="sidebar" label="Navigation" value={tab} onChange={setTab} tabs={[{ id: 'menu', label: 'Menu' }, { id: 'recent', label: 'Recent' }]} />
      <nav aria-label={section.label} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <ul className="flex flex-col gap-0.5"><NavRows items={items} /></ul>
        {!items.length && <p className="px-3 py-2 text-sm text-sidebar-muted">Pages you open will show up here.</p>}
      </nav>
    </div>
  );
}

/**
 * Default desktop navigation. The sidebar surface holds a rounded icon-rail card (workspace mark, one icon per section, Setup, search,
 * panel toggle, account) and, beside it, a 300px panel with the current section's pages. Both read navigation.js. Floating style
 * turns the whole sidebar into a bordered rounded card; inset leaves it flat. Hidden panel (⌘B) leaves just the rail card; pages
 * outside any section (Setup has its own tree) show the rail only. Phones use the drawer sidebar instead.
 */
export function RailSidebar() {
  const sections = useNavSections();
  const { pathname } = useLocation();
  const { variant, layout, collapsed, toggle } = useSidebar();
  const { show: showSearch } = useSearch();
  const { activeWorkspace } = useAuth();
  const bottom = NAV.bottom.filter((item) => isVisibleTo(item, activeWorkspace));
  const floating = variant === 'floating';
  const current = sections.find((s) => s.items.some((item) => isActivePath(item, pathname)));

  return (
    <aside aria-label="Application" className={cn('flex min-h-0 shrink-0 self-stretch overflow-hidden', floating ? 'm-2 rounded-2xl border border-sidebar-line bg-sidebar' : variant === 'flat' && 'border-r border-sidebar-line')}>
      <div className="m-2 flex w-16 shrink-0 flex-col items-center gap-1.5 overflow-hidden rounded-2xl bg-rail py-4 text-sidebar-ink">
        <div className="mb-4"><WorkspaceSwitcherLogo compact /></div>
        <nav aria-label="Sections" className="flex flex-col items-center gap-1.5">
          {sections.map((s) => <RailLink key={s.id} to={s.items[0].to} end={s.items[0].end} icon={s.icon} label={s.label} active={s === current} />)}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1.5">
          {bottom.map((item) => <RailLink key={item.to} to={item.to} icon={item.icon} label={item.label} active={isActivePath({ ...item, end: !item.prefix }, pathname)} />)}
          <RailButton icon="search" label="Search" onClick={showSearch} />
          {(current || layout === 'sidebar') && <RailButton icon="panel-left" label={collapsed ? 'Show panel' : 'Hide panel'} onClick={toggle} />}
          <div className="mt-3"><NavUserCompact side="right" align="end" rail /></div>
        </div>
      </div>
      {current && !collapsed && <Panel section={current} sections={sections} />}
    </aside>
  );
}
