import { SidebarCollapsibleGroup, SidebarGroup, SidebarMenu, SidebarNavItem } from '../components/sidebar/SidebarParts.jsx';
import { NAV } from './navigation.js';

const NavItems = ({ items }) => items.map((item) => <SidebarNavItem key={item.to} {...item} />);

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
  if (!NAV.bottom.length) return null;
  return (
    <nav aria-label="Secondary">
      <SidebarMenu><NavItems items={NAV.bottom} /></SidebarMenu>
    </nav>
  );
}
