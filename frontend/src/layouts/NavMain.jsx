import { useLocation } from 'react-router-dom';
import { SidebarCollapsibleItem, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarNavItem, SidebarSubItem } from '../components/sidebar/SidebarParts.jsx';
import { NAV_GROUPS } from './navigation.js';

/** Renders NAV_GROUPS: labelled groups of leaf rows and collapsible sections. */
export function NavMain() {
  const { pathname } = useLocation();
  return NAV_GROUPS.map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => item.children ? (
          <SidebarCollapsibleItem key={item.label} icon={item.icon} label={item.label} active={item.children.some((c) => pathname.startsWith(c.to))}>
            {item.children.map((child) => <SidebarSubItem key={child.to} {...child} />)}
          </SidebarCollapsibleItem>
        ) : (
          <SidebarNavItem key={item.to} {...item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  ));
}
