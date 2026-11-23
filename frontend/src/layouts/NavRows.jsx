import { useMemo, useState } from 'react';
import { hasRole } from '@app/shared';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { cn } from '../lib/cn.js';
import { isVisibleTo, NAV } from './navigation.js';
import { useSearch } from './SearchContext.jsx';

/**
 * The navigation rows shared by the icon-rail panel and the classic sidebar, so both look and behave the same: 44px rows with a 22px
 * icon, an optional "+" that opens the New dialog, expandable parents with a connector line, and the Search field that opens ⌘K.
 */

/** navigation.js → sections (the unnamed top-level rows are "Overview", then one section per group). Role-hidden items are dropped. */
export function useNavSections() {
  const { activeWorkspace } = useAuth();
  return useMemo(() => {
    const show = (items) => items.filter((item) => isVisibleTo(item, activeWorkspace));
    return [{ id: 'overview', label: 'Overview', icon: 'home', items: show(NAV.main) }, ...NAV.groups.map((g) => ({ id: g.label, label: g.label, icon: g.icon, items: show(g.items) }))]
      .filter((section) => section.items.length);
  }, [activeWorkspace]);
}

/** Panel rows are 44px: 22px icon, 15px label, optional "+" on the right; active = tinted. */
const ROW = 'flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring';
export const ROW_ACTION = 'grid size-9 shrink-0 place-items-center rounded-lg text-sidebar-muted outline-none hover:bg-sidebar-accent hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-ring';

function PanelRow({ item }) {
  const { activeWorkspace } = useAuth();
  const canCreate = item.create && hasRole(activeWorkspace?.role, 'member');
  return (
    <li className="flex items-center">
      <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ROW, isActive && 'bg-sidebar-accent')}>
        <Icon name={item.icon} className="size-5.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge != null && <span className="rounded-md bg-sidebar-accent px-1.5 text-xs leading-5 text-sidebar-muted">{item.badge}</span>}
      </NavLink>
      {canCreate && <Link to={`${item.to}?new=1`} aria-label={`New ${item.label}`} title={`New ${item.label}`} className={ROW_ACTION}><Icon name="plus" className="size-5" /></Link>}
    </li>
  );
}

/** An expandable row (icon, label, +/− toggle) with its pages indented on a connector line. */
function ParentRow({ parent, children }) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(ROW, 'w-full flex-none')}>
        <Icon name={parent.icon} className="size-5.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{parent.label}</span>
        <Icon name={open ? 'minus' : 'plus'} className="size-5 shrink-0 text-sidebar-muted" />
      </button>
      {open && (
        <ul className="ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-line-strong">
          {children.map((item) => (
            <li key={item.to} className="relative pl-4 before:absolute before:left-0 before:top-1/2 before:h-px before:w-4 before:bg-line-strong">
              <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ROW, 'h-10 w-full flex-none', isActive && 'bg-sidebar-accent')}>{item.label}</NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Rows in order; consecutive items sharing a `parent` collapse under one ParentRow. */
export function NavRows({ items }) {
  const rows = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (item.parent && last?.parent?.label === item.parent.label) last.children.push(item);
    else rows.push(item.parent ? { parent: item.parent, children: [item] } : { item });
  }
  return rows.map((row) => (row.parent ? <ParentRow key={`p:${row.parent.label}`} parent={row.parent} children={row.children} /> : <PanelRow key={row.item.to} item={row.item} />));
}

export function SearchField() {
  const { show } = useSearch();
  return (
    <button type="button" onClick={show} className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-sidebar-muted/40 px-3.5 text-[15px] text-sidebar-muted outline-none hover:bg-sidebar-accent focus-visible:ring-4 focus-visible:ring-ring">
      <Icon name="search" className="size-5 shrink-0" />
      <span className="flex-1 text-left">Search</span>
    </button>
  );
}

