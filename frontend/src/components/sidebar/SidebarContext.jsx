import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useLocalStorageState } from '../../hooks/useLocalStorageState.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

const SidebarContext = createContext(null);

/**
 * Navigation state. Layout (rail | sidebar | top bar) and style (flat | inset | floating) are the tenant owner's choice
 * (Customize, saved in the database); phones always use the drawer. Icon-collapse is personal (this browser).
 * Cmd/Ctrl+B toggles the sidebar; Escape closes the mobile drawer.
 */
export function SidebarProvider({ children }) {
  const { ui } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [collapsed, setCollapsed] = useLocalStorageState('sidebar:collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { variant } = ui;
  const layout = isMobile ? 'sidebar' : ui.layout; // the top bar is a desktop layout; phones keep the drawer

  const toggle = useCallback(() => (isMobile ? setMobileOpen((open) => !open) : layout !== 'topbar' ? setCollapsed((c) => !c) : undefined), [isMobile, layout, setCollapsed]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); toggle(); }
      else if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ variant, layout, isMobile, collapsed, expand: () => setCollapsed(false), mobileOpen, setMobileOpen, toggle }),
    [variant, layout, isMobile, collapsed, setCollapsed, mobileOpen, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div data-variant={variant} data-layout={layout} className={`flex h-svh w-full overflow-hidden ${layout === 'topbar' ? 'flex-col' : ''} ${{ flat: 'bg-sidebar', inset: 'bg-chrome', floating: 'bg-bg' }[variant]}`}>{children}</div>
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used inside <SidebarProvider>');
  return context;
};
