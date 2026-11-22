import { Outlet, useLocation } from 'react-router-dom';
import { SidebarInset, SidebarTrigger } from '../components/sidebar/Sidebar.jsx';
import { SidebarProvider } from '../components/sidebar/SidebarContext.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { AppSidebar } from './AppSidebar.jsx';
import { titleFor } from './navigation.js';

function AppHeader() {
  const { pathname } = useLocation();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      <SidebarTrigger />
      <span className="h-5 w-px bg-line" aria-hidden="true" />
      <h1 className="text-sm font-medium text-ink">{titleFor(pathname)}</h1>
      <ThemeToggle className="ml-auto" />
    </header>
  );
}

/** Signed-in shell: collapsible sidebar (inset by default, floating optional) + header + routed page. */
export function AppLayout() {
  return (
    <SidebarProvider defaultVariant="inset">
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6"><Outlet /></main>
      </SidebarInset>
    </SidebarProvider>
  );
}
