import { cn } from '../../lib/cn.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { useSidebar } from './SidebarContext.jsx';

/**
 * Desktop: sticky column (expanded 16rem / icon-only 4.5rem). Floating draws it as a raised card; inset leaves
 * it flush with the page so the main area (SidebarInset) becomes the raised card.
 * Mobile: off-canvas drawer with a backdrop.
 */
export function Sidebar({ label = 'Sidebar', children }) {
  const { variant, iconOnly, isMobile, mobileOpen, setMobileOpen } = useSidebar();

  if (isMobile) {
    return (
      <>
        <div aria-hidden="true" onClick={() => setMobileOpen(false)} className={cn('fixed inset-0 z-40 bg-black/50 transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')} />
        <aside
          aria-label={label}
          inert={mobileOpen ? undefined : ''}
          className={cn('fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-xl transition-[transform,visibility] duration-200', mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full')}
        >
          {children}
        </aside>
      </>
    );
  }

  return (
    <aside aria-label={label} data-collapsed={iconOnly} className={cn('sticky top-0 h-screen shrink-0 p-2 transition-[width] duration-200', iconOnly ? 'w-[4.5rem]' : 'w-64')}>
      <div className={cn('flex h-full flex-col rounded-2xl', variant === 'floating' && 'border border-line bg-surface shadow-lg')}>{children}</div>
    </aside>
  );
}

/** The main content area. Under the inset variant it is a rounded, raised card. */
export function SidebarInset({ children }) {
  const { variant } = useSidebar();
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', variant === 'inset' ? 'm-2 rounded-2xl border border-line bg-inset shadow-sm md:ml-0 md:min-h-[calc(100svh-1rem)]' : 'min-h-screen bg-bg')}>
      {children}
    </div>
  );
}

export function SidebarTrigger() {
  const { toggle, isMobile, mobileOpen, collapsed } = useSidebar();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle sidebar" aria-expanded={isMobile ? mobileOpen : !collapsed} className="text-muted hover:text-ink">
      <Icon name="panel-left" className="size-4.5" />
    </Button>
  );
}
