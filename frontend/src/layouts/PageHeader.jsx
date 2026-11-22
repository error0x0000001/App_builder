import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { SidebarTrigger } from '../components/sidebar/Sidebar.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { useSearch } from './SearchContext.jsx';
import { pageFor } from './navigation.js';

const HeaderSlots = createContext(null);

export function PageHeaderProvider({ children }) {
  const [metaEl, setMetaEl] = useState(null);
  const [actionsEl, setActionsEl] = useState(null);
  const [title, setTitle] = useState(null);
  return <HeaderSlots.Provider value={{ metaEl, setMetaEl, actionsEl, setActionsEl, title, setTitle }}>{children}</HeaderSlots.Provider>;
}

/**
 * Compact 48px bar above the scrolling content: page icon + title (+ "• meta") on the left,
 * page actions and the theme toggle on the right.
 */
export function PageHeader() {
  const { pathname } = useLocation();
  const { setMetaEl, setActionsEl, title } = useContext(HeaderSlots);
  const { iconOnly, isMobile } = useSidebar();
  const { icon, label } = title ?? pageFor(pathname);
  const { show: showSearch } = useSearch(); // pages whose name comes from data (Setup) override the nav lookup
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
      {(isMobile || iconOnly) && <SidebarTrigger />}
      <Icon name={icon} className="size-4 shrink-0 text-muted" />
      <h1 className="min-w-0 truncate text-sm font-semibold text-ink">{label}</h1>
      <span ref={setMetaEl} className="hidden min-w-0 items-center gap-2 text-sm text-muted empty:hidden sm:flex" />
      <div ref={setActionsEl} className="ml-auto flex items-center gap-2" />
      <Button size="icon" variant="ghost" aria-label="Search" onClick={showSearch} className="md:hidden"><Icon name="search" className="size-4" /></Button> {/* phones have no Ctrl/⌘ K */}
    </header>
  );
}

/** Text after the title, e.g. "• 156 companies". Rendered by the page; shown in the fixed header. */
export function PageHeaderMeta({ children }) {
  const { metaEl } = useContext(HeaderSlots);
  return metaEl ? createPortal(<><span aria-hidden="true">•</span><span className="truncate">{children}</span></>, metaEl) : null;
}

/** Page header buttons (right side of the fixed header). */
export function PageHeaderActions({ children }) {
  const { actionsEl } = useContext(HeaderSlots);
  return actionsEl ? createPortal(children, actionsEl) : null;
}

/** Overrides the header title/icon for pages whose name is data-driven. Cleared when the page unmounts. */
export function PageHeaderTitle({ icon, children }) {
  const { setTitle } = useContext(HeaderSlots);
  useEffect(() => {
    setTitle({ icon, label: children });
    return () => setTitle(null);
  }, [icon, children, setTitle]);
  return null;
}
