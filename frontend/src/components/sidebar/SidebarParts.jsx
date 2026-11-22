import { forwardRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { Icon } from '../ui/Icon.jsx';
import { Kbd } from '../ui/Kbd.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { useSidebar } from './SidebarContext.jsx';

/* Spacing contract: 12px side gutter, 32px menu rows with no gap, 24px section labels, 12px between sections.
   Collapsed: 4px gutter so each row becomes a 40px slot holding a 20px icon. */
const useGutter = () => (useSidebar().iconOnly ? 'px-1' : 'px-3');

export const SidebarHeader = ({ className, children }) => <div className={cn('flex flex-col pt-3', useGutter(), className)}>{children}</div>;
export const SidebarFooter = ({ className, children }) => <div className={cn('flex flex-col gap-3 pb-4 pt-3', useGutter(), className)}>{children}</div>;
export const SidebarContent = ({ children }) => <nav aria-label="Main" className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden py-3', useGutter())}>{children}</nav>;
export const SidebarGroup = ({ children }) => <div className="flex w-full min-w-0 flex-col">{children}</div>;
export const SidebarMenu = ({ children }) => <ul className="flex w-full min-w-0 flex-col">{children}</ul>;
export const SidebarMenuItem = ({ children }) => <li className="relative">{children}</li>;

/** Wraps a group of rows in the sidebar gutter (used for the pinned bottom links). */
export const SidebarSection = ({ children, ...rest }) => <nav className={cn('pb-1', useGutter())} {...rest}>{children}</nav>;

/**
 * Row button. Pass `to` for a router link (active state automatic) or use as a button.
 * Sizes: default (h-8) and lg (h-10: workspace switcher, user row). Icon-only mode keeps just the first child.
 */
export const SidebarMenuButton = forwardRef(function SidebarMenuButton({ to, end, size = 'default', isActive = false, tooltip, className, children, ...rest }, ref) {
  const { iconOnly } = useSidebar();
  const base = cn(
    'flex w-full items-center gap-2.5 overflow-hidden rounded-lg text-left text-sm text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary data-[open=true]:bg-sidebar-accent',
    size === 'lg' ? 'h-10 gap-2.5' : 'h-8',
    iconOnly ? (size === 'lg' ? 'size-10 p-1' : 'size-10 p-2.5 [&>svg:first-child]:size-5') : size === 'lg' ? 'px-0' : 'px-2',
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
        {badge != null && <span className="rounded-md bg-sidebar-accent px-1.5 text-xs leading-5 text-sidebar-muted">{badge}</span>}
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
        <SidebarMenuButton tooltip="Search" onClick={onClick} className={cn('border border-sidebar-line bg-surface/60', !iconOnly && 'text-sidebar-muted')}>
          <Icon name="search" className="size-4 shrink-0" />
          <span className="flex-1 truncate">Search</span>
          <Kbd className="text-sidebar-muted">{shortcut}</Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Titled section: collapse chevron, label (24px row) and an optional bordered "+" action (action: { icon, label, to }). */
export function SidebarCollapsibleGroup({ label, defaultOpen = true, action, children }) {
  const { iconOnly } = useSidebar();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <SidebarGroup>
      {!iconOnly && (
        <div className="flex h-6 items-center">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-sm text-sidebar-muted outline-none hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-sidebar-primary">
            <Icon name="chevron-down" className={cn('size-3.5 shrink-0 transition-transform', !open && '-rotate-90')} />
            <span className="truncate">{label}</span>
          </button>
          {action && (
            <NavLink to={action.to} aria-label={action.label} title={action.label} className="mr-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border border-sidebar-muted/50 text-sidebar-muted outline-none hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-sidebar-primary">
              <Icon name={action.icon ?? 'plus'} className="size-3" />
            </NavLink>
          )}
        </div>
      )}
      {(open || iconOnly) && <SidebarMenu>{children}</SidebarMenu>}
    </SidebarGroup>
  );
}
