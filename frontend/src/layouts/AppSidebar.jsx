import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar, SidebarTrigger } from '../components/sidebar/Sidebar.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { SidebarContent, SidebarFooter, SidebarHeader } from '../components/sidebar/SidebarParts.jsx';
import { WorkspaceSwitcher } from '../components/workspace/WorkspaceSwitcher.jsx';
import { NavBottom, NavMain } from './NavMain.jsx';
import { SearchField } from './NavRows.jsx';
import { NavUser } from './NavUser.jsx';
import { ChatPanel } from './ChatPanel.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';

export function AppSidebar() {
  const { setMobileOpen } = useSidebar();
  const { pathname } = useLocation();
  const [view, setView] = useState('chats');
  const onChat = pathname.startsWith('/app/chat');
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
        {onChat ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <Tabs tone="sidebar" label="Sidebar view" value={view} onChange={setView} tabs={[{ id: 'chats', label: 'Chats' }, { id: 'menu', label: 'Menu' }]} />
            {view === 'chats' ? <ChatPanel /> : <NavMain />}
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
