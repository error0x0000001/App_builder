import { cn } from '../../lib/cn.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { useSidebar } from './SidebarContext.jsx';

/**
 * Desktop: sticky column (expanded 16rem / icon-only 4rem) with a toggle rail on its edge. Inset leaves it flush with the
 * page; floating draws it as a bordered card. Dark navy in both themes.
 * Mobile: off-canvas drawer with a backdrop.
 */
export function Sidebar({ label = 'Sidebar', children }) {
  const { variant, iconOnly, isMobile, mobileOpen, setMobileOpen, toggle } = useSidebar();

  if (isMobile) {
    return (
      <>
        <div aria-hidden="true" onClick={() => setMobileOpen(false)} className={cn('fixed inset-0 z-40 bg-black/50 transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')} />
        <aside
          aria-label={label}
          inert={mobileOpen ? undefined : ''}
          className={cn('fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-line bg-sidebar text-sidebar-ink transition-[transform,visibility] duration-200', mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full')}
        >
          {children}
        </aside>
      </>
    );
  }

  return (
    <aside aria-label={label} data-collapsed={iconOnly} className={cn('h-full shrink-0 p-2 transition-[width] duration-200', iconOnly ? 'w-16' : 'w-66')}>
      <div className={cn('relative flex h-full flex-col rounded-xl text-sidebar-ink', variant === 'floating' && 'border border-sidebar-line bg-sidebar')}>
        {children}
      </div>
      {/* Rail: a thin hit area on the edge that toggles the sidebar (mouse only; the header trigger is the accessible control). */}
      <button type="button" aria-hidden="true" tabIndex={-1} title="Toggle sidebar" onClick={toggle} className="group absolute inset-y-0 right-0 z-20 w-3 translate-x-1/2 cursor-w-resize">
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-line" />
      </button>
    </aside>
  );
}

/** The main content area: a fixed-height bordered floating card in every variant — its content scrolls inside, it never grows. */
export function SidebarInset({ children }) {
  return <div className="m-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-inset md:ml-0">{children}</div>;
}

const TRIGGER_TONES = {
  content: 'text-muted! hover:bg-surface-2! hover:text-ink!',
  sidebar: 'text-sidebar-muted! hover:bg-sidebar-accent! hover:text-sidebar-ink!',
};

/** tone="sidebar" when rendered on the sidebar surface, "content" in the page header. */
export function SidebarTrigger({ tone = 'content' }) {
  const { toggle, isMobile, mobileOpen, collapsed } = useSidebar();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle sidebar" aria-expanded={isMobile ? mobileOpen : !collapsed} className={`size-8 ${TRIGGER_TONES[tone]}`}>
      <Icon name="panel-left" />
    </Button>
  );
}
