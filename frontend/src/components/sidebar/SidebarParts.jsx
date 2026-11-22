import { forwardRef, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { useSidebar } from './SidebarContext.jsx';

export const SidebarHeader = ({ className, children }) => <div className={cn('flex flex-col gap-2 p-2', className)}>{children}</div>;
export const SidebarFooter = ({ className, children }) => <div className={cn('flex flex-col gap-2 p-2', className)}>{children}</div>;
export const SidebarContent = ({ children }) => <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">{children}</nav>;
export const SidebarGroup = ({ children }) => <div className="flex w-full min-w-0 flex-col p-2">{children}</div>;

export function SidebarGroupLabel({ children }) {
  const { iconOnly } = useSidebar();
  if (iconOnly) return null;
  return <div className="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted">{children}</div>;
}

export const SidebarMenu = ({ children }) => <ul className="flex w-full min-w-0 flex-col gap-1">{children}</ul>;
export const SidebarMenuItem = ({ children }) => <li className="relative">{children}</li>;

/**
 * Row button. Pass `to` for a router link (active state automatic) or use as a button.
 * Sizes: default (h-8) and lg (h-12, used by the workspace switcher / user menu). Icon-only mode keeps just the first child.
 */
export const SidebarMenuButton = forwardRef(function SidebarMenuButton({ to, end, size = 'default', isActive = false, tooltip, className, children, ...rest }, ref) {
  const { iconOnly } = useSidebar();
  const base = cn(
    'flex w-full items-center gap-2 overflow-hidden rounded-md text-left text-sm text-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-link data-[open=true]:bg-sidebar-accent',
    size === 'lg' ? 'h-12' : 'h-8',
    iconOnly ? (size === 'lg' ? 'size-8 p-0' : 'size-8 p-2') : 'p-2',
    className,
  );
  const element = to ? (
    <NavLink ref={ref} to={to} end={end} className={({ isActive: active }) => cn(base, active && 'bg-sidebar-accent font-medium')} {...rest}>{children}</NavLink>
  ) : (
    <button ref={ref} type="button" className={cn(base, isActive && 'bg-sidebar-accent font-medium')} {...rest}>{children}</button>
  );
  return <Tooltip label={tooltip} disabled={!iconOnly}>{element}</Tooltip>;
});

/** Convenience for the common "icon + label" leaf row. */
export function SidebarNavItem({ to, end, icon, label }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton to={to} end={end} tooltip={label}>
        <Icon name={icon} className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Parent row that expands a list of sub-items (opens automatically when one of them is the current page). */
export function SidebarCollapsibleItem({ icon, label, active, children }) {
  const { iconOnly, expand } = useSidebar();
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const expanded = open && !iconOnly;

  const onClick = () => {
    if (iconOnly) { expand(); setOpen(true); } else setOpen((o) => !o);
  };
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={label} aria-expanded={expanded} onClick={onClick}>
        <Icon name={icon} className="size-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <Icon name="chevron-right" className={cn('size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-90')} />
      </SidebarMenuButton>
      {expanded && <ul className="mx-3.5 mt-1 flex min-w-0 flex-col gap-1 border-l border-line px-2.5 py-0.5">{children}</ul>}
    </SidebarMenuItem>
  );
}

export const SidebarSubItem = ({ to, label }) => (
  <li>
    <NavLink to={to} className={({ isActive }) => cn('flex h-7 min-w-0 items-center rounded-md px-2 text-sm text-ink outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-link', isActive && 'bg-sidebar-accent font-medium')}>
      <span className="truncate">{label}</span>
    </NavLink>
  </li>
);
