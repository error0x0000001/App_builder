import { Fragment } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/DropdownMenu.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { OverflowList } from '../components/ui/OverflowList.jsx';
import { TenantSwitcherLogo } from '../components/tenant/TenantSwitcher.jsx';
import { cn } from '../lib/cn.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { isVisibleTo, NAV } from './navigation.js';
import { NavUserCompact } from './NavUser.jsx';

/** Text-only entries; the active one is an outlined pill. */
const ENTRY = 'flex h-8 items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-3 text-sm text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent';
const ACTIVE = 'border-sidebar-primary bg-sidebar-accent font-medium';
const matches = (item, pathname) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));

/** navigation.js → top-level entries: single links, and each group as a dropdown. Role-hidden items are dropped. */
function useEntries() {
  const { activeTenant } = useAuth();
  const show = (items) => items.filter((item) => isVisibleTo(item, activeTenant));
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
 * Top navigation (desktop): quelli mark (opens the tenant switcher) · text entries (groups are dropdowns, the rest
 * collapse into "More") · account. Search stays on Ctrl/⌘ K. Flat is a full-width bar with a bottom border; inset sits flush on the navigation colour; floating is a bordered card
 * with a small gap above the content card. Entries come from navigation.js, like the sidebar. Navy = the Midnight theme.
 */
export function TopBar() {
  const { variant } = useSidebar();
  const entries = useEntries();
  return (
    <header className={cn('shrink-0', variant === 'flat' ? 'border-b border-sidebar-line bg-sidebar px-2' : variant === 'floating' ? 'p-2' : 'p-2 pb-0')}>
      <div className={cn('flex h-12 items-center gap-2 px-2 text-sidebar-ink', variant !== 'flat' && 'rounded-xl', variant === 'floating' && 'border border-sidebar-line bg-sidebar')}>
        <TenantSwitcherLogo />
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-sidebar-line" />
        <nav aria-label="Main" className="flex min-w-0 flex-1">
          <OverflowList items={entries} getKey={(e) => e.key} gap={2} reserve={84} renderItem={(e) => (e.type === 'group' ? <GroupEntry entry={e} /> : <LinkEntry item={e.item} />)} renderOverflow={(hidden) => <MoreEntry hidden={hidden} />} />
        </nav>
        <NavUserCompact />
      </div>
    </header>
  );
}
