import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@app/shared';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSidebar } from '../sidebar/SidebarContext.jsx';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../sidebar/SidebarParts.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/DropdownMenu.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Logo } from '../ui/Logo.jsx';

/** The workspace list + "Add workspace" — shared by the sidebar header and the top bar. */
function WorkspaceMenuContent({ side, align, className }) {
  const { workspaces, activeWorkspace, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const select = async (id) => { await switchWorkspace(id); navigate('/app'); };
  return (
    <DropdownMenuContent side={side} align={align} className={className}>
      <DropdownMenuLabel>Workspaces — {activeWorkspace?.name ?? 'none selected'}</DropdownMenuLabel>
      {workspaces.map((w) => (
        <DropdownMenuItem key={w.id} onSelect={() => select(w.id)} className="gap-2 p-2">
          <Avatar name={w.name} size="size-6" shape="square" className="text-[10px]" />
          <span className="flex-1 truncate">{w.name}</span>
          {w.id === activeWorkspace?.id && <Icon name="check" className="size-4 text-muted" />}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => navigate('/app/workspaces/new')} className="gap-2 p-2">
        <span className="grid size-6 place-items-center rounded-md border border-line"><Icon name="plus" className="size-4" /></span>
        <span className="font-medium text-muted">Add workspace</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** The cloudbase mark IS the workspace switcher — click it to see, switch or add a workspace. Top bar: wordmark + chevron; `compact` (icon rail): mark only, menu opens to the side. */
export function WorkspaceSwitcherLogo({ compact = false }) {
  const { activeWorkspace } = useAuth();
  const name = activeWorkspace?.name ?? 'No workspace';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" aria-label={`Workspace: ${name}. Switch workspace`} title={name} className="flex h-9 items-center gap-1 rounded-lg px-1.5 text-sidebar-ink outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent" {...props}>
            <Logo size="sm" tone="sidebar" markOnly={compact} />
            {!compact && <Icon name="chevron-down" className="size-3.5 shrink-0 opacity-60" />}
          </button>
        )}
      </DropdownMenuTrigger>
      <WorkspaceMenuContent side={compact ? 'right' : 'bottom'} align="start" className="w-64" />
    </DropdownMenu>
  );
}

/** Sidebar header: the active workspace (tile, name, role) — opens a menu to switch or add one. */
export function WorkspaceSwitcher() {
  const { activeWorkspace } = useAuth();
  const { iconOnly } = useSidebar();
  const name = activeWorkspace?.name ?? 'No workspace';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            {(props) => (
              <SidebarMenuButton size="lg" aria-label={`Workspace: ${name}`} {...props}>
                <Avatar name={name} size="size-8" shape="square" className="bg-sidebar-primary! text-sidebar-primary-ink!" />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    <span className="truncate">{name}</span>
                    <Icon name="chevron-down" className="size-3.5 shrink-0 opacity-60" />
                  </span>
                  <span className="flex items-center gap-1 text-xs opacity-70">
                    <Icon name="user" className="size-3 shrink-0" />
                    <span className="truncate">{activeWorkspace ? ROLE_LABELS[activeWorkspace.role] : 'Create a workspace'}</span>
                  </span>
                </span>
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <WorkspaceMenuContent side={iconOnly ? 'right' : 'bottom'} className={iconOnly ? undefined : 'w-full'} />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
