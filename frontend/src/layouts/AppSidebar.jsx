import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar, SidebarTrigger } from '../components/sidebar/Sidebar.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { SidebarContent, SidebarFooter, SidebarHeader, SidebarSearch } from '../components/sidebar/SidebarParts.jsx';
import { searchShortcutLabel } from '../components/ui/Kbd.jsx';
import { WorkspaceSwitcher } from '../components/workspace/WorkspaceSwitcher.jsx';
import { NavBottom, NavMain } from './NavMain.jsx';
import { NavUser } from './NavUser.jsx';

export function AppSidebar({ onSearch }) {
  const { iconOnly, setMobileOpen } = useSidebar();
  const { pathname } = useLocation();
  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]); // close the drawer after navigating

  return (
    <Sidebar label="Application">
      <SidebarHeader>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1"><WorkspaceSwitcher /></div>
          {!iconOnly && <SidebarTrigger tone="sidebar" />}
        </div>
        <SidebarSearch onClick={onSearch} shortcut={searchShortcutLabel()} />
      </SidebarHeader>
      <SidebarContent><NavMain /></SidebarContent>
      <NavBottom />
      <SidebarFooter><NavUser /></SidebarFooter>
    </Sidebar>
  );
}
