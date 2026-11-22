import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from '../components/sidebar/Sidebar.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { SidebarContent, SidebarFooter, SidebarHeader } from '../components/sidebar/SidebarParts.jsx';
import { WorkspaceSwitcher } from '../components/workspace/WorkspaceSwitcher.jsx';
import { NavMain } from './NavMain.jsx';
import { NavUser } from './NavUser.jsx';

export function AppSidebar() {
  const { setMobileOpen } = useSidebar();
  const { pathname } = useLocation();
  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]); // close the drawer after navigating

  return (
    <Sidebar label="Application">
      <SidebarHeader><WorkspaceSwitcher /></SidebarHeader>
      <SidebarContent><NavMain /></SidebarContent>
      <SidebarFooter><NavUser /></SidebarFooter>
    </Sidebar>
  );
}
