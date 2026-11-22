import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../components/sidebar/SidebarParts.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/DropdownMenu.jsx';
import { Icon } from '../components/ui/Icon.jsx';

/** Account menu body (identity, Profile, Security, Log out) — shared by the sidebar footer and the top bar. */
function UserMenuContent({ side, align, className }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fullName = `${user.firstName} ${user.lastName}`;
  return (
    <DropdownMenuContent side={side} align={align} className={className}>
      <DropdownMenuLabel className="flex items-center gap-2 p-1.5 text-ink!">
        <Avatar name={fullName} size="size-9" shape="square" />
        <span className="grid min-w-0 leading-tight"><span className="truncate text-sm font-medium">{fullName}</span><span className="truncate text-xs opacity-70">{user.email}</span></span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon="user" onSelect={() => navigate('/app/profile')}>Profile</DropdownMenuItem>
      <DropdownMenuItem icon="shield" onSelect={() => navigate('/app/security')}>Security</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon="log-out" onSelect={signOut}>Log out</DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Top bar: just the avatar, same menu. */
export function NavUserCompact() {
  const { user } = useAuth();
  const fullName = `${user.firstName} ${user.lastName}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" aria-label={`Account menu for ${fullName}`} className="grid size-9 place-items-center rounded-lg outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent" {...props}>
            <Avatar name={fullName} size="size-8" shape="square" className="bg-sidebar-primary! text-sidebar-primary-ink!" />
          </button>
        )}
      </DropdownMenuTrigger>
      <UserMenuContent side="bottom" align="end" className="w-64" />
    </DropdownMenu>
  );
}

/** Sidebar footer: current user (avatar, name, email) with a "…" menu for account shortcuts and sign out. */
export function NavUser() {
  const { user } = useAuth();
  const { iconOnly } = useSidebar();
  const fullName = `${user.firstName} ${user.lastName}`;

  // Colors inherit from the container, so the same block works on the sidebar and inside the menu.
  const identity = (avatarSize, avatarClassName) => (
    <>
      <Avatar name={fullName} size={avatarSize} shape="square" className={avatarClassName} />
      <span className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="flex items-center gap-1 text-sm font-medium">
          <span className="truncate">{fullName}</span>
          <Icon name="chevron-down" className="size-3.5 shrink-0 opacity-60" />
        </span>
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
                {identity(iconOnly ? 'size-8' : 'size-9', 'bg-sidebar-primary! text-sidebar-primary-ink!')}
                <Icon name="more-horizontal" className="ml-auto size-4 shrink-0 stroke-[3.5] opacity-80" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <UserMenuContent side={iconOnly ? 'right' : 'top'} align={iconOnly ? 'end' : 'start'} className={iconOnly ? undefined : 'w-full'} />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
