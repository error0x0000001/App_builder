import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../components/sidebar/SidebarParts.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/DropdownMenu.jsx';
import { Icon } from '../components/ui/Icon.jsx';

/** Sidebar footer: current user, with a menu for account shortcuts and sign out. */
export function NavUser() {
  const { user, signOut } = useAuth();
  const { iconOnly } = useSidebar();
  const navigate = useNavigate();
  const fullName = `${user.firstName} ${user.lastName}`;

  // Colors inherit from the container, so the same block works on the navy sidebar and inside the light menu.
  const identity = (avatarClassName) => (
    <>
      <Avatar name={fullName} size="size-8" shape="square" className={avatarClassName} />
      <span className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{fullName}</span>
        <span className="truncate text-xs opacity-70">{user.email}</span>
      </span>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            {(props) => (
              <SidebarMenuButton size="lg" aria-label={`Account menu for ${fullName}`} {...props}>
                {identity('bg-sidebar-primary! text-sidebar-primary-ink!')}
                <Icon name="chevrons-up-down" className="ml-auto size-4 shrink-0 opacity-60" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side={iconOnly ? 'right' : 'top'} align={iconOnly ? 'end' : 'start'} className={iconOnly ? undefined : 'w-full'}>
            <DropdownMenuLabel className="flex items-center gap-2 p-1.5 text-ink">{identity()}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon="user" onSelect={() => navigate('/app/profile')}>Profile</DropdownMenuItem>
            <DropdownMenuItem icon="shield" onSelect={() => navigate('/app/security')}>Security</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon="log-out" onSelect={signOut}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
