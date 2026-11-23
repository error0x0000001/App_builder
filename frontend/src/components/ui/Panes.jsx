import { createElement } from 'react';
import { useSidebar } from '../sidebar/SidebarContext.jsx';
import { cn } from '../../lib/cn.js';

/** Floating style on desktop: every pane is its own card. (Phones never float: panes are full-screen there.) */
const useFloatingPanes = () => { const { variant, isMobile } = useSidebar(); return variant === 'floating' && !isMobile; };

/**
 * A page with side columns (chat list · conversation · info, Documents views · files, Setup tree · page). Flat and inset: columns separated by a thin border inside
 * the page card. Floating: the page card steps aside (see SidebarInset `panes`) and each `Pane` is its own rounded, bordered card with a gap — like the navigation.
 */
export function PaneGroup({ className, children }) {
  return <div className={cn('flex h-full min-h-0', useFloatingPanes() && 'gap-2', className)}>{children}</div>;
}

/** One column. `side` = which edge carries the divider when panes are not floating (a left column divides on its right, and vice versa); no `side` = the main pane. */
export function Pane({ as = 'div', side, className, children, ...rest }) {
  const floating = useFloatingPanes();
  return createElement(as, { className: cn('min-h-0 min-w-0', floating ? 'overflow-hidden rounded-xl border border-line bg-surface' : side === 'left' ? 'border-r border-line' : side === 'right' ? 'border-l border-line' : '', className), ...rest }, children);
}
