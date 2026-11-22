import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/DropdownMenu.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Kbd, searchShortcutLabel } from '../components/ui/Kbd.jsx';
import { OverflowList } from '../components/ui/OverflowList.jsx';
import { WorkspaceSwitcherCompact } from '../components/workspace/WorkspaceSwitcher.jsx';
import { cn } from '../lib/cn.js';
import { useVisibleItems } from './NavMain.jsx';
import { NAV_ITEMS } from './navigation.js';
import { NavUserCompact } from './NavUser.jsx';

const ITEM = 'flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-sm text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary';

const TopNavItem = ({ item }) => (
  <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ITEM, isActive && 'bg-sidebar-accent font-medium')}>
    <Icon name={item.icon} className="size-4 shrink-0" />{item.label}
  </NavLink>
);

/** "More": everything that did not fit, in a menu — the active page's row is marked. */
function MoreMenu({ hidden }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = (item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" aria-label={`More navigation (${hidden.length})`} className={cn(ITEM, 'data-[open=true]:bg-sidebar-accent', hidden.some(isActive) && 'bg-sidebar-accent font-medium')} {...props}>
            <Icon name="more-horizontal" className="size-4 shrink-0" />More
            <span className="rounded-md bg-sidebar-accent px-1.5 text-xs leading-5 text-sidebar-muted">{hidden.length}</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
        {hidden.map((item) => (
          <DropdownMenuItem key={item.to} icon={item.icon} onSelect={() => navigate(item.to)} className={isActive(item) ? 'bg-surface-2 font-medium' : undefined}>{item.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Top navigation (desktop): workspace · every nav item · search · account. Inset sits flush on the page; floating is a
 * bordered card. When the items don't fit, the rest move into "More". Items come from navigation.js, like the sidebar.
 */
export function TopBar({ onSearch }) {
  const { variant } = useSidebar();
  const items = useVisibleItems(NAV_ITEMS);
  return (
    <header className={cn('shrink-0 p-2', variant !== 'floating' && 'pb-0')}>
      <div className={cn('flex h-12 items-center gap-1 rounded-xl px-2 text-sidebar-ink', variant === 'floating' && 'border border-sidebar-line bg-sidebar')}>
        <WorkspaceSwitcherCompact />
        <nav aria-label="Main" className="mx-2 flex min-w-0 flex-1">
          <OverflowList items={items} getKey={(item) => item.to} renderItem={(item) => <TopNavItem item={item} />} renderOverflow={(hidden) => <MoreMenu hidden={hidden} />} />
        </nav>
        <button type="button" onClick={onSearch} aria-label="Search" className={cn(ITEM, 'border border-sidebar-line bg-surface/60 text-sidebar-muted')}>
          <Icon name="search" className="size-4 shrink-0" />
          <span className="hidden lg:inline">Search</span>
          <Kbd className="hidden text-sidebar-muted lg:inline-flex">{searchShortcutLabel()}</Kbd>
        </button>
        <NavUserCompact />
      </div>
    </header>
  );
}
