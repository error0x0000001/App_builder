import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Sidebar } from '../components/sidebar/Sidebar.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenuItem } from '../components/sidebar/SidebarParts.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { WorkspaceSwitcher } from '../components/workspace/WorkspaceSwitcher.jsx';
import { NAV_GROUPS } from './navigation.js';

export function AppSidebar() {
  const { iconOnly, setMobileOpen } = useSidebar();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]); // close the drawer after navigating

  const fullName = `${user.firstName} ${user.lastName}`;
  return (
    <Sidebar label="Application">
      <SidebarHeader>
        <Link to="/app" aria-label="Home" className={iconOnly ? 'mx-auto' : undefined}><Logo iconOnly={iconOnly} className="[&_span]:text-xl [&_svg]:h-7 [&_svg]:w-10" /></Link>
        <WorkspaceSwitcher iconOnly={iconOnly} />
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} label={group.label}>
            {group.items.map((item) => <SidebarMenuItem key={item.to} {...item} />)}
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className={iconOnly ? 'mx-auto' : 'flex items-center gap-3 px-1'} title={iconOnly ? fullName : undefined}>
          <Avatar name={fullName} size="size-9" />
          {!iconOnly && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{fullName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          )}
        </div>
        <Button variant="neutral" size={iconOnly ? 'icon' : 'sm'} fullWidth={!iconOnly} className={iconOnly ? 'mx-auto' : undefined} onClick={signOut} aria-label="Sign out" title="Sign out">
          <Icon name="log-out" />{!iconOnly && 'Sign out'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
