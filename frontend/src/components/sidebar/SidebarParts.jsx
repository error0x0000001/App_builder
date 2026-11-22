import { forwardRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { Icon } from '../ui/Icon.jsx';
import { Kbd } from '../ui/Kbd.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { useSidebar } from './SidebarContext.jsx';

export const SidebarHeader = ({ className, children }) => <div className={cn('flex flex-col gap-2 p-2', className)}>{children}</div>;
export const SidebarFooter = ({ className, children }) => <div className={cn('flex flex-col gap-2 p-2', className)}>{children}</div>;
export const SidebarContent = ({ children }) => <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">{children}</nav>;
export const SidebarGroup = ({ children }) => <div className="flex w-full min-w-0 flex-col p-2">{children}</div>;
export const SidebarMenu = ({ children }) => <ul className="flex w-full min-w-0 flex-col gap-1">{children}</ul>;
export const SidebarMenuItem = ({ children }) => <li className="relative">{children}</li>;

/**
 * Row button. Pass `to` for a router link (active state automatic) or use as a button.
 * Sizes: default (h-9) and lg (h-12: workspace switcher, user row). Icon-only mode keeps just the first child.
 */
export const SidebarMenuButton = forwardRef(function SidebarMenuButton({ to, end, size = 'default', isActive = false, tooltip, className, children, ...rest }, ref) {
  const { iconOnly } = useSidebar();
  const base = cn(
    'flex w-full items-center gap-2.5 overflow-hidden rounded-lg text-left text-sm text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent',
    size === 'lg' ? 'h-12' : 'h-9',
    iconOnly ? (size === 'lg' ? 'size-9 p-0' : 'size-9 p-2.5') : 'px-2.5',
    className,
  );
  const element = to ? (
    <NavLink ref={ref} to={to} end={end} className={({ isActive: active }) => cn(base, active && 'bg-sidebar-accent font-medium')} {...rest}>{children}</NavLink>
  ) : (
    <button ref={ref} type="button" className={cn(base, isActive && 'bg-sidebar-accent font-medium')} {...rest}>{children}</button>
  );
  return <Tooltip label={tooltip} disabled={!iconOnly}>{element}</Tooltip>;
});

/** Standard "icon + label (+ count badge)" row. Every nav item in the app is rendered by this. */
export function SidebarNavItem({ to, end, icon, label, badge }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton to={to} end={end} tooltip={label}>
        <Icon name={icon} className="size-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {badge != null && <span className="rounded-md bg-sidebar-accent px-1.5 py-0.5 text-xs font-medium text-sidebar-muted">{badge}</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Search field look-alike that opens the command palette. */
export function SidebarSearch({ onClick, shortcut }) {
  const { iconOnly } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="Search" onClick={onClick} className={iconOnly ? 'border border-sidebar-line' : 'border border-sidebar-line text-sidebar-muted'}>
          <Icon name="search" className="size-4 shrink-0" />
          <span className="flex-1 truncate">Search</span>
          <Kbd className="text-sidebar-muted">{shortcut}</Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Titled section with a collapse chevron and an optional "+" action (action: { icon, label, to }). */
export function SidebarCollapsibleGroup({ label, defaultOpen = true, action, children }) {
  const { iconOnly } = useSidebar();
  const [open, setOpen] = useState(defaultOpen);
  const showItems = open || iconOnly;
  return (
    <SidebarGroup>
      {!iconOnly && (
        <div className="flex h-8 items-center gap-1">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-sidebar-muted outline-none hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-sidebar-primary">
            <Icon name="chevron-down" className={cn('size-3.5 shrink-0 transition-transform', !open && '-rotate-90')} />
            <span className="truncate">{label}</span>
          </button>
          {action && (
            <NavLink to={action.to} aria-label={action.label} title={action.label} className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-muted outline-none hover:bg-sidebar-accent hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-sidebar-primary">
              <Icon name={action.icon ?? 'plus'} className="size-4" />
            </NavLink>
          )}
        </div>
      )}
      {showItems && <SidebarMenu>{children}</SidebarMenu>}
    </SidebarGroup>
  );
}
