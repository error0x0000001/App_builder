import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarInset } from '../components/sidebar/Sidebar.jsx';
import { SidebarProvider } from '../components/sidebar/SidebarContext.jsx';
import { AppSidebar } from './AppSidebar.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { PageHeader, PageHeaderProvider } from './PageHeader.jsx';

/**
 * Signed-in shell: sidebar (inset by default, floating optional) + one-viewport-tall content card.
 * The card's header is pinned; only the content below it scrolls.
 */
export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SidebarProvider defaultVariant="inset">
      <PageHeaderProvider>
        <AppSidebar onSearch={() => setSearchOpen(true)} />
        <SidebarInset>
          <PageHeader />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 px-4 pb-4 pt-5"><Outlet /></div>
          </main>
        </SidebarInset>
        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      </PageHeaderProvider>
    </SidebarProvider>
  );
}
