import { Fragment } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/DropdownMenu.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Kbd, searchShortcutLabel } from '../components/ui/Kbd.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { OverflowList } from '../components/ui/OverflowList.jsx';
import { WorkspaceSwitcherCompact } from '../components/workspace/WorkspaceSwitcher.jsx';
import { cn } from '../lib/cn.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { isVisibleTo } from './NavMain.jsx';
import { NAV } from './navigation.js';
import { NavUserCompact } from './NavUser.jsx';

/** Text-only entries; the active one is an outlined pill. */
const ENTRY = 'flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-4 text-sm text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent';
const ACTIVE = 'border-sidebar-primary bg-sidebar-accent font-medium';
const matches = (item, pathname) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));

/** navigation.js → top-level entries: single links, and each group as a dropdown. Role-hidden items are dropped. */
function useEntries() {
  const { activeWorkspace } = useAuth();
  const show = (items) => items.filter((item) => isVisibleTo(item, activeWorkspace));
  const link = (item) => ({ type: 'link', key: item.to, item });
  const groups = NAV.groups.map((g) => ({ type: 'group', key: `g:${g.label}`, label: g.label, items: show(g.items) })).filter((g) => g.items.length);
  return [...show(NAV.main).map(link), ...groups, ...show(NAV.bottom).map(link)];
}

function LinkEntry({ item }) {
  return <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ENTRY, isActive && ACTIVE)}>{item.label}</NavLink>;
}

function GroupEntry({ entry }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = entry.items.some((i) => matches(i, pathname));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" className={cn(ENTRY, active && ACTIVE)} {...props}>
            {entry.label}<Icon name="chevron-down" className="size-3.5 shrink-0 opacity-70" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {entry.items.map((item) => (
          <DropdownMenuItem key={item.to} icon={item.icon} onSelect={() => navigate(item.to)} className={matches(item, pathname) ? 'bg-surface-2 font-medium' : undefined}>{item.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "More ▾": whatever did not fit — single links, and groups shown under their title. */
function MoreEntry({ hidden }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = hidden.some((e) => (e.type === 'link' ? matches(e.item, pathname) : e.items.some((i) => matches(i, pathname))));
  const row = (item) => <DropdownMenuItem key={item.to} icon={item.icon} onSelect={() => navigate(item.to)} className={matches(item, pathname) ? 'bg-surface-2 font-medium' : undefined}>{item.label}</DropdownMenuItem>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" aria-label={`More navigation (${hidden.length})`} className={cn(ENTRY, active && ACTIVE)} {...props}>
            More<Icon name="chevron-down" className="size-3.5 shrink-0 opacity-70" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
        {hidden.map((entry, i) => (
          <Fragment key={entry.key}>
            {entry.type === 'group' ? <>{i > 0 && <DropdownMenuSeparator />}<DropdownMenuLabel>{entry.label}</DropdownMenuLabel>{entry.items.map(row)}</> : <>{hidden[i - 1]?.type === 'group' && <DropdownMenuSeparator />}{row(entry.item)}</>}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Top navigation (desktop): brand · text entries (groups are dropdowns, the rest collapse into "More") · search ·
 * workspace · account. Inset sits flush on the page; floating is a bordered card with a gap above the content card.
 * Entries come from navigation.js, like the sidebar. Navy comes from the Midnight workspace theme.
 */
export function TopBar({ onSearch }) {
  const { variant } = useSidebar();
  const entries = useEntries();
  return (
    <header className={cn('shrink-0 p-2', variant === 'floating' ? 'pb-3' : 'pb-0')}>
      <div className={cn('flex h-14 items-center gap-3 rounded-xl px-4 text-sidebar-ink', variant === 'floating' && 'border border-sidebar-line bg-sidebar')}>
        <Logo size="sm" className="shrink-0 text-sidebar-ink" />
        <span aria-hidden="true" className="h-6 w-px shrink-0 bg-sidebar-line" />
        <nav aria-label="Main" className="flex min-w-0 flex-1">
          <OverflowList items={entries} getKey={(e) => e.key} gap={4} reserve={96} renderItem={(e) => (e.type === 'group' ? <GroupEntry entry={e} /> : <LinkEntry item={e.item} />)} renderOverflow={(hidden) => <MoreEntry hidden={hidden} />} />
        </nav>
        <button type="button" onClick={onSearch} aria-label="Search" className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-sidebar-line bg-surface/60 px-3 text-sm text-sidebar-muted outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary">
          <Icon name="search" className="size-4 shrink-0" />
          <span className="hidden xl:inline">Search</span>
          <Kbd className="hidden text-sidebar-muted xl:inline-flex">{searchShortcutLabel()}</Kbd>
        </button>
        <WorkspaceSwitcherCompact />
        <NavUserCompact />
      </div>
    </header>
  );
}
