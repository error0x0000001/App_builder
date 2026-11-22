import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

export const SIDEBAR_VARIANTS = [
  { value: 'inset', label: 'Inset' },
  { value: 'floating', label: 'Floating' },
];

export const NAV_LAYOUTS = [
  { value: 'sidebar', label: 'Sidebar' },
  { value: 'topbar', label: 'Top bar' },
];

const SidebarContext = createContext(null);

/**
 * Navigation state: layout (sidebar | top bar), style variant (inset | floating — applies to both), desktop icon-collapse,
 * mobile drawer. Phones always use the drawer. Cmd/Ctrl+B toggles the sidebar; Escape closes the mobile drawer.
 */
export function SidebarProvider({ defaultVariant = 'inset', children }) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [storedVariant, setVariant] = useLocalStorageState('sidebar:variant', defaultVariant);
  const [storedLayout, setLayout] = useLocalStorageState('nav:layout', 'sidebar');
  const [collapsed, setCollapsed] = useLocalStorageState('sidebar:collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const variant = SIDEBAR_VARIANTS.some((v) => v.value === storedVariant) ? storedVariant : defaultVariant;
  const preferredLayout = NAV_LAYOUTS.some((l) => l.value === storedLayout) ? storedLayout : 'sidebar';
  const layout = isMobile ? 'sidebar' : preferredLayout; // the top bar is a desktop layout; phones keep the drawer

  const toggle = useCallback(() => (isMobile ? setMobileOpen((open) => !open) : layout === 'sidebar' ? setCollapsed((c) => !c) : undefined), [isMobile, layout, setCollapsed]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); toggle(); }
      else if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ variant, setVariant, layout, preferredLayout, setLayout, isMobile, iconOnly: layout === 'sidebar' && collapsed && !isMobile, collapsed, expand: () => setCollapsed(false), mobileOpen, setMobileOpen, toggle }),
    [variant, setVariant, layout, preferredLayout, setLayout, isMobile, collapsed, setCollapsed, mobileOpen, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div data-variant={variant} data-layout={layout} className={`flex h-svh w-full overflow-hidden ${layout === 'topbar' ? 'flex-col' : ''} ${variant === 'inset' ? 'bg-sidebar' : 'bg-bg'}`}>{children}</div>
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used inside <SidebarProvider>');
  return context;
};
