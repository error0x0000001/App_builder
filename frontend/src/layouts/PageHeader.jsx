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
  const [actionsEl, setActionsEl] = useState(null);
  return <HeaderSlots.Provider value={{ actionsEl, setActionsEl }}>{children}</HeaderSlots.Provider>;
}

/** Fixed bar above the scrolling content: page icon + title on the left, page actions + theme toggle on the right. */
export function PageHeader() {
  const { pathname } = useLocation();
  const { setActionsEl } = useContext(HeaderSlots);
  const { iconOnly, isMobile } = useSidebar();
  const { icon, label } = pageFor(pathname);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      {(isMobile || iconOnly) && <SidebarTrigger />}
      <Icon name={icon} className="size-4 text-muted" />
      <h1 className="truncate text-sm font-semibold text-ink">{label}</h1>
      <div ref={setActionsEl} className="ml-auto flex items-center gap-2" />
      <ThemeToggle />
    </header>
  );
}

/** Pages render their header buttons with this; they appear in the right side of the fixed header. */
export function PageHeaderActions({ children }) {
  const { actionsEl } = useContext(HeaderSlots);
  return actionsEl ? createPortal(children, actionsEl) : null;
}
