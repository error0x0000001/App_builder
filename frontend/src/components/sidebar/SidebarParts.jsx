import { forwardRef } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn.js';

/* Classic sidebar frame: 12px side gutter. Its page rows are the shared 44px NavRows (layouts/NavRows.jsx), the same as the rail panel;
   collapsing the sidebar swaps it for the icon rail (layouts/RailSidebar.jsx). */
const GUTTER = 'px-3';

export const SidebarHeader = ({ className, children }) => <div className={cn('flex flex-col gap-3 pt-3', GUTTER, className)}>{children}</div>;
export const SidebarFooter = ({ className, children }) => <div className={cn('flex flex-col gap-3 pb-4 pt-3', GUTTER, className)}>{children}</div>;
export const SidebarContent = ({ children }) => <nav aria-label="Main" className={cn('flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden py-4', GUTTER)}>{children}</nav>;
export const SidebarMenu = ({ children }) => <ul className="flex w-full min-w-0 flex-col">{children}</ul>;
export const SidebarMenuItem = ({ children }) => <li className="relative">{children}</li>;

/**
 * Row button. Pass `to` for a router link (active state automatic) or use as a button.
 * Sizes: default (h-8) and lg (h-10: tenant switcher, user row).
 */
export const SidebarMenuButton = forwardRef(function SidebarMenuButton({ to, end, size = 'default', isActive = false, className, children, ...rest }, ref) {
  const base = cn(
    'flex w-full items-center gap-2.5 overflow-hidden rounded-lg text-left text-sm text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent',
    size === 'lg' ? 'h-10 gap-2.5' : 'h-8',
    size === 'lg' ? 'px-0' : 'px-2',
    className,
  );
  return to ? (
    <NavLink ref={ref} to={to} end={end} className={({ isActive: active }) => cn(base, active && 'bg-sidebar-accent font-medium')} {...rest}>{children}</NavLink>
  ) : (
    <button ref={ref} type="button" className={cn(base, isActive && 'bg-sidebar-accent font-medium')} {...rest}>{children}</button>
  );
});
