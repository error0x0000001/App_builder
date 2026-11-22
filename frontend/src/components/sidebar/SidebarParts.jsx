import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { Icon } from '../ui/Icon.jsx';
import { useSidebar } from './SidebarContext.jsx';

export const SidebarHeader = ({ className, children }) => <div className={cn('flex flex-col gap-3 p-3', className)}>{children}</div>;
export const SidebarFooter = ({ className, children }) => <div className={cn('flex flex-col gap-2 border-t border-line p-3', className)}>{children}</div>;
export const SidebarContent = ({ children }) => <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2 py-2">{children}</nav>;

export const SidebarGroup = ({ label, children }) => {
  const { iconOnly } = useSidebar();
  return (
    <div>
      {label && !iconOnly && <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>}
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
};

/** One row. Renders a router NavLink when `to` is given, otherwise a button. Icon-only mode keeps a title tooltip. */
export function SidebarMenuItem({ to, end, icon, label, onClick }) {
  const { iconOnly } = useSidebar();
  const classes = (active) => cn(
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    iconOnly && 'justify-center px-0',
    active ? 'bg-accent-soft font-medium text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
  );
  const content = (
    <>
      <Icon name={icon} className="size-4.5 shrink-0" />
      <span className={cn('truncate', iconOnly && 'sr-only')}>{label}</span>
    </>
  );
  return (
    <li>
      {to ? (
        <NavLink to={to} end={end} title={iconOnly ? label : undefined} className={({ isActive }) => classes(isActive)}>{content}</NavLink>
      ) : (
        <button type="button" onClick={onClick} title={iconOnly ? label : undefined} className={classes(false)}>{content}</button>
      )}
    </li>
  );
}
