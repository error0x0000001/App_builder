import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { SidebarTrigger } from '../components/sidebar/Sidebar.jsx';
import { useSidebar } from '../components/sidebar/SidebarContext.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { pageFor } from './navigation.js';

const HeaderSlots = createContext(null);

export function PageHeaderProvider({ children }) {
  const [metaEl, setMetaEl] = useState(null);
  const [actionsEl, setActionsEl] = useState(null);
  return <HeaderSlots.Provider value={{ metaEl, setMetaEl, actionsEl, setActionsEl }}>{children}</HeaderSlots.Provider>;
}

/**
 * Compact 48px bar above the scrolling content: page icon + title (+ "• meta") on the left,
 * page actions and the theme toggle on the right.
 */
export function PageHeader() {
  const { pathname } = useLocation();
  const { setMetaEl, setActionsEl } = useContext(HeaderSlots);
  const { iconOnly, isMobile } = useSidebar();
  const { icon, label } = pageFor(pathname);
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
      {(isMobile || iconOnly) && <SidebarTrigger />}
      <Icon name={icon} className="size-4 shrink-0 text-muted" />
      <h1 className="truncate text-sm font-semibold text-ink">{label}</h1>
      <span ref={setMetaEl} className="flex min-w-0 items-center gap-2 text-sm text-muted empty:hidden" />
      <div ref={setActionsEl} className="ml-auto flex items-center gap-2" />
      <ThemeToggle />
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
