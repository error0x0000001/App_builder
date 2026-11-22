import { hasRole } from '@app/shared';
import { useAuth } from '../auth/AuthProvider.jsx';
import { SidebarCollapsibleGroup, SidebarGroup, SidebarMenu, SidebarNavItem } from '../components/sidebar/SidebarParts.jsx';
import { NAV } from './navigation.js';

/** Items a role may not see are hidden here (the API enforces the same rule). */
export const isVisibleTo = (item, workspace) => !item.minRole || Boolean(workspace && hasRole(workspace.role, item.minRole));
export const useVisibleItems = (items) => {
  const { activeWorkspace } = useAuth();
  return items.filter((item) => isVisibleTo(item, activeWorkspace));
};

const NavItems = ({ items }) => useVisibleItems(items).map(({ minRole, bleed, ...item }) => <SidebarNavItem key={item.to} {...item} />);

/** Renders NAV.main and NAV.groups. */
export function NavMain() {
  return (
    <>
      <SidebarGroup>
        <SidebarMenu><NavItems items={NAV.main} /></SidebarMenu>
      </SidebarGroup>
      {NAV.groups.map((group) => (
        <SidebarCollapsibleGroup key={group.label} label={group.label} defaultOpen={group.defaultOpen} action={group.action}>
          <NavItems items={group.items} />
        </SidebarCollapsibleGroup>
      ))}
    </>
  );
}

/** Renders NAV.bottom (pinned above the user menu). */
export function NavBottom() {
  if (!useVisibleItems(NAV.bottom).length) return null;
  return (
    <nav aria-label="Secondary">
      <SidebarMenu><NavItems items={NAV.bottom} /></SidebarMenu>
    </nav>
  );
}
