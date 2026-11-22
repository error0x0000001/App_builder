import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '../lib/cn.js';
import { pageFor } from './navigation.js';
import { SidebarInset } from '../components/sidebar/Sidebar.jsx';
import { SidebarProvider, useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { AppSidebar } from './AppSidebar.jsx';
import { CustomizeProvider } from './CustomizeContext.jsx';
import { CustomizeSheet } from './CustomizeSheet.jsx';
import { GlobalSearch } from './GlobalSearch.jsx';
import { SearchProvider } from './SearchContext.jsx';
import { ImpersonationBanner } from './ImpersonationBanner.jsx';
import { PageHeader, PageHeaderProvider } from './PageHeader.jsx';
import { TopBar } from './TopBar.jsx';

/** Sidebar or top bar (the person's choice; phones always get the drawer), then the content card. */
function Shell({ bleed }) {
  const { layout } = useSidebar();
  const content = (
    <SidebarInset>
      <ImpersonationBanner />
      <PageHeader />
      <main className={cn('min-h-0 flex-1', bleed ? 'overflow-hidden' : 'overflow-y-auto')}>
        {bleed ? <Outlet /> : <div className="space-y-6 px-4 pb-4 pt-5"><Outlet /></div>}
      </main>
    </SidebarInset>
  );
  return layout === 'topbar' ? <><TopBar />{content}</> : <><AppSidebar />{content}</>;
}

/**
 * Signed-in shell: sidebar or top bar (inset by default, floating optional) + one-viewport-tall content card.
 * The card's header is pinned; only the content below it scrolls.
 */
export function AppLayout() {
  const bleed = pageFor(useLocation().pathname).bleed; // pages that lay out their own panes (Setup) get the bare card body

  return (
    <SidebarProvider>
      <CustomizeProvider>
        <SearchProvider>
          <PageHeaderProvider>
            <Shell bleed={bleed} />
            <GlobalSearch />
            <CustomizeSheet />
          </PageHeaderProvider>
        </SearchProvider>
      </CustomizeProvider>
    </SidebarProvider>
  );
}
