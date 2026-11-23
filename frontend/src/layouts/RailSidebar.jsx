import { useEffect, useMemo, useState } from 'react';
import { hasRole } from '@app/shared';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { Icon } from '../components/ui/Icon.jsx';
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

/** Panel rows are 44px: 22px icon, 15px label, optional "+" on the right; active = tinted. */
const ROW = 'flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring';
const ROW_ACTION = 'grid size-9 shrink-0 place-items-center rounded-lg text-sidebar-muted outline-none hover:bg-sidebar-accent hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-ring';

function PanelRow({ item }) {
  const { activeWorkspace } = useAuth();
  const canCreate = item.create && hasRole(activeWorkspace?.role, 'member');
  return (
    <li className="flex items-center">
      <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ROW, isActive && 'bg-sidebar-accent')}>
        <Icon name={item.icon} className="size-5.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge != null && <span className="rounded-md bg-sidebar-accent px-1.5 text-xs leading-5 text-sidebar-muted">{item.badge}</span>}
      </NavLink>
      {canCreate && <Link to={`${item.to}?new=1`} aria-label={`New ${item.label}`} title={`New ${item.label}`} className={ROW_ACTION}><Icon name="plus" className="size-5" /></Link>}
    </li>
  );
}

/** An expandable row (icon, label, +/− toggle) with its pages indented on a connector line. */
function ParentRow({ parent, children }) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(ROW, 'w-full flex-none')}>
        <Icon name={parent.icon} className="size-5.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{parent.label}</span>
        <Icon name={open ? 'minus' : 'plus'} className="size-5 shrink-0 text-sidebar-muted" />
      </button>
      {open && (
        <ul className="ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-line-strong">
          {children.map((item) => (
            <li key={item.to} className="relative pl-4 before:absolute before:left-0 before:top-1/2 before:h-px before:w-4 before:bg-line-strong">
              <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ROW, 'h-10 w-full flex-none', isActive && 'bg-sidebar-accent')}>{item.label}</NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Rows in order; consecutive items sharing a `parent` collapse under one ParentRow. */
function Rows({ items }) {
  const rows = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (item.parent && last?.parent?.label === item.parent.label) last.children.push(item);
    else rows.push(item.parent ? { parent: item.parent, children: [item] } : { item });
  }
  return rows.map((row) => (row.parent ? <ParentRow key={`p:${row.parent.label}`} parent={row.parent} children={row.children} /> : <PanelRow key={row.item.to} item={row.item} />));
}

function SearchField() {
  const { show } = useSearch();
  return (
    <button type="button" onClick={show} className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-line-strong bg-surface px-3.5 text-[15px] text-muted outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-ring">
      <Icon name="search" className="size-5 shrink-0" />
      <span className="flex-1 text-left">Search</span>
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
  const recentItems = recent.map((to) => all.find((item) => item.to === to)).filter(Boolean).map(({ parent, ...item }) => item);
  const items = tab === 'recent' ? recentItems : section.items;

  return (
    <div className="flex min-h-0 w-75 min-w-0 flex-col gap-5 px-5 pb-4 pt-7">
      <div className="flex h-9 items-center justify-between gap-2 px-1">
        <h2 className="truncate text-xl font-semibold text-sidebar-ink">{section.label}</h2>
        <button type="button" aria-label="Hide panel" onClick={toggle} className={ROW_ACTION}><Icon name="panel-left" className="size-5" /></button>
      </div>
      <SearchField />
      <Tabs tone="ink" label="Navigation" value={tab} onChange={setTab} tabs={[{ id: 'menu', label: 'Menu' }, { id: 'recent', label: 'Recent' }]} />
      <nav aria-label={section.label} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <ul className="flex flex-col gap-0.5"><Rows items={items} /></ul>
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
  const sections = useSections();
  const { pathname } = useLocation();
  const { variant, collapsed, toggle } = useSidebar();
  const { show: showSearch } = useSearch();
  const { activeWorkspace } = useAuth();
  const bottom = NAV.bottom.filter((item) => isVisibleTo(item, activeWorkspace));
  const floating = variant === 'floating';
  const current = sections.find((s) => s.items.some((item) => matches(item, pathname)));

  return (
    <aside aria-label="Application" className={cn('flex min-h-0 shrink-0 self-stretch overflow-hidden bg-sidebar', floating ? 'm-2 rounded-2xl border border-sidebar-line' : 'border-r border-sidebar-line')}>
      <div className="m-2 flex w-16 shrink-0 flex-col items-center gap-1.5 overflow-hidden rounded-2xl bg-rail py-4 text-sidebar-ink">
        <div className="mb-4"><WorkspaceSwitcherLogo compact /></div>
        <nav aria-label="Sections" className="flex flex-col items-center gap-1.5">
          {sections.map((s) => <RailLink key={s.id} to={s.items[0].to} end={s.items[0].end} icon={s.icon} label={s.label} active={s === current} />)}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1.5">
          {bottom.map((item) => <RailLink key={item.to} to={item.to} icon={item.icon} label={item.label} active={matches({ ...item, end: !item.prefix }, pathname)} />)}
          <RailButton icon="search" label="Search" onClick={showSearch} />
          {current && <RailButton icon="panel-left" label={collapsed ? 'Show panel' : 'Hide panel'} onClick={toggle} />}
          <div className="mt-3"><NavUserCompact side="right" align="end" rail /></div>
        </div>
      </div>
      {current && !collapsed && <Panel section={current} sections={sections} />}
    </aside>
  );
}
