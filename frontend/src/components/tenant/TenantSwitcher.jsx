import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@app/shared';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../sidebar/SidebarParts.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/DropdownMenu.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Logo } from '../ui/Logo.jsx';

/** The tenant list + "Add tenant" — shared by the sidebar header and the top bar. */
function TenantMenuContent({ side, align, className }) {
  const { tenants, activeTenant, switchTenant } = useAuth();
  const navigate = useNavigate();
  const select = async (id) => { await switchTenant(id); navigate('/app'); };
  return (
    <DropdownMenuContent side={side} align={align} className={className}>
      <DropdownMenuLabel>Tenants — {activeTenant?.name ?? 'none selected'}</DropdownMenuLabel>
      {tenants.map((w) => (
        <DropdownMenuItem key={w.id} onSelect={() => select(w.id)} className="gap-2 p-2">
          <Avatar name={w.name} size="size-6" shape="square" className="text-[10px]" />
          <span className="flex-1 truncate">{w.name}</span>
          {w.id === activeTenant?.id && <Icon name="check" className="size-4 text-muted" />}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => navigate('/app/tenants/new')} className="gap-2 p-2">
        <span className="grid size-6 place-items-center rounded-md border border-line"><Icon name="plus" className="size-4" /></span>
        <span className="font-medium text-muted">Add tenant</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** The quelli mark IS the tenant switcher — click it to see, switch or add a tenant. Top bar: wordmark + chevron; `compact` (icon rail): mark only, menu opens to the side. */
export function TenantSwitcherLogo({ compact = false }) {
  const { activeTenant } = useAuth();
  const name = activeTenant?.name ?? 'No tenant';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" aria-label={`Tenant: ${name}. Switch tenant`} title={name} className="flex h-9 items-center gap-1 rounded-lg px-1.5 text-sidebar-ink outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent" {...props}>
            <Logo size={compact ? 'md' : 'sm'} tone="sidebar" markOnly={compact} />
            {!compact && <Icon name="chevron-down" className="size-3.5 shrink-0 opacity-60" />}
          </button>
        )}
      </DropdownMenuTrigger>
      <TenantMenuContent side={compact ? 'right' : 'bottom'} align="start" className="w-64" />
    </DropdownMenu>
  );
}

/** Sidebar header: the active tenant (tile, name, role) — opens a menu to switch or add one. */
export function TenantSwitcher() {
  const { activeTenant } = useAuth();
  const name = activeTenant?.name ?? 'No tenant';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            {(props) => (
              <SidebarMenuButton size="lg" aria-label={`Tenant: ${name}`} {...props}>
                <Avatar name={name} size="size-8" shape="square" className="bg-sidebar-primary! text-sidebar-primary-ink!" />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    <span className="truncate">{name}</span>
                    <Icon name="chevron-down" className="size-3.5 shrink-0 opacity-60" />
                  </span>
                  <span className="flex items-center gap-1 text-xs opacity-70">
                    <Icon name="user" className="size-3 shrink-0" />
                    <span className="truncate">{activeTenant ? ROLE_LABELS[activeTenant.role] : 'Create a tenant'}</span>
                  </span>
                </span>
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <TenantMenuContent side="bottom" className="w-full" />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
