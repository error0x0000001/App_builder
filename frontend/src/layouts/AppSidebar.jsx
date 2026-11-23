import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar, SidebarTrigger } from '../components/sidebar/Sidebar.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { SidebarContent, SidebarFooter, SidebarHeader } from '../components/sidebar/SidebarParts.jsx';
import { WorkspaceSwitcher } from '../components/workspace/WorkspaceSwitcher.jsx';
import { NavBottom, NavMain } from './NavMain.jsx';
import { SearchField } from './NavRows.jsx';
import { NavUser } from './NavUser.jsx';
import { SECTION_PANELS } from './sectionPanels.js';
import { NAV } from './navigation.js';
import { Tabs } from '../components/ui/Tabs.jsx';

export function AppSidebar() {
  const { setMobileOpen } = useSidebar();
  const { pathname } = useLocation();
  const [view, setView] = useState('chats');
  const section = [...NAV.groups, ...NAV.bottom.filter((i) => i.panel).map((i) => ({ label: i.label, panel: i.panel, items: [i] }))].find((g) => g.panel && pathname.startsWith(g.items[0].to));
  const SectionPanel = section && SECTION_PANELS[section.panel];
  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]); // close the drawer after navigating

  return (
    <Sidebar label="Application">
      <SidebarHeader>
        <div className="flex items-center gap-1 pb-1">
          <div className="min-w-0 flex-1"><WorkspaceSwitcher /></div>
          <SidebarTrigger tone="sidebar" className="-mr-1" />
        </div>
        <SearchField />
      </SidebarHeader>
      <SidebarContent>
        {SectionPanel ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <Tabs tone="sidebar" label="Sidebar view" value={view} onChange={setView} tabs={[{ id: 'chats', label: section.label }, { id: 'menu', label: 'Menu' }]} />
            {view === 'chats' ? <SectionPanel /> : <NavMain />}
          </div>
        ) : <NavMain />}
      </SidebarContent>
      <SidebarFooter>
        <NavBottom />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
