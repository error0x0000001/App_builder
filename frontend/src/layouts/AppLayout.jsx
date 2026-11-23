import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '../lib/cn.js';
import { pageFor } from './navigation.js';
import { SidebarInset } from '../components/sidebar/Sidebar.jsx';
import { SidebarProvider, useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { AppSidebar } from './AppSidebar.jsx';
import { RailSidebar } from './RailSidebar.jsx';
import { CustomizeProvider } from './CustomizeContext.jsx';
import { CustomizeSheet } from './CustomizeSheet.jsx';
import { GlobalSearch } from './GlobalSearch.jsx';
import { SearchProvider } from './SearchContext.jsx';
import { ImpersonationBanner } from './ImpersonationBanner.jsx';
import { ChatRealtimeProvider } from '../pages/chat/ChatRealtime.jsx';
import { CallProvider } from '../pages/chat/calls/CallProvider.jsx';
import { MobileBar } from './MobileBar.jsx';
import { TopBar } from './TopBar.jsx';

/** Rail, sidebar or top bar (the owner's choice; phones always get the drawer), then the content card. */
function Shell({ bleed, panes }) {
  const { layout, collapsed } = useSidebar();
  const content = (
    <SidebarInset panes={panes}>
      <ImpersonationBanner />
      <MobileBar />
      <main className={cn('min-h-0 flex-1', bleed ? 'overflow-hidden' : 'overflow-y-auto')}>
        {bleed ? <Outlet /> : <div className="space-y-6 px-4 pb-4 pt-5"><Outlet /></div>}
      </main>
    </SidebarInset>
  );
  // Collapsing the classic sidebar leaves the icon rail (same component and icons as the Rail layout).
  const NAVIGATION = { topbar: TopBar, rail: RailSidebar, sidebar: collapsed ? RailSidebar : AppSidebar }[layout];
  return <><NAVIGATION />{content}</>;
}

/**
 * Signed-in shell: sidebar or top bar (inset by default, floating optional) + one-viewport-tall content card.
 * The card's header is pinned; only the content below it scrolls.
 */
export function AppLayout() {
  const page = pageFor(useLocation().pathname);
  const bleed = page.bleed; // pages that lay out their own panes (Setup) get the bare card body

  return (
    <SidebarProvider>
      <CustomizeProvider>
        <SearchProvider>
          <ChatRealtimeProvider>
            <CallProvider>
              <Shell bleed={bleed} panes={page.panes} />
              <GlobalSearch />
              <CustomizeSheet />
            </CallProvider>
          </ChatRealtimeProvider>
        </SearchProvider>
      </CustomizeProvider>
    </SidebarProvider>
  );
}
