import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

export const SIDEBAR_VARIANTS = [
  { value: 'inset', label: 'Inset' },
  { value: 'floating', label: 'Floating' },
];

const SidebarContext = createContext(null);

/**
 * Sidebar state: style variant (inset | floating), desktop icon-collapse, mobile drawer.
 * Cmd/Ctrl+B toggles; Escape closes the mobile drawer.
 */
export function SidebarProvider({ defaultVariant = 'inset', children }) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [storedVariant, setVariant] = useLocalStorageState('sidebar:variant', defaultVariant);
  const [collapsed, setCollapsed] = useLocalStorageState('sidebar:collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const variant = SIDEBAR_VARIANTS.some((v) => v.value === storedVariant) ? storedVariant : defaultVariant;

  const toggle = useCallback(() => (isMobile ? setMobileOpen((open) => !open) : setCollapsed((c) => !c)), [isMobile, setCollapsed]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); toggle(); }
      else if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ variant, setVariant, isMobile, iconOnly: collapsed && !isMobile, collapsed, mobileOpen, setMobileOpen, toggle }),
    [variant, setVariant, isMobile, collapsed, mobileOpen, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div data-variant={variant} className={`flex min-h-screen w-full ${variant === 'inset' ? 'bg-sidebar' : 'bg-bg'}`}>{children}</div>
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used inside <SidebarProvider>');
  return context;
};
