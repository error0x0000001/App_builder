import { useEffect, useMemo, useState } from 'react';
import { hasRole } from '@app/shared';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { cn } from '../lib/cn.js';
import { isVisibleTo, NAV } from './navigation.js';
import { useSearch } from './SearchContext.jsx';
import { useChatUnread } from '../pages/chat/ChatRealtime.jsx';

/**
 * The navigation rows shared by the icon-rail panel and the classic sidebar, so both look and behave the same: 44px rows with a 22px
 * icon, an optional "+" that opens the New dialog, expandable parents with a connector line, and the Search field that opens ⌘K.
 */

/** navigation.js → sections (the unnamed top-level rows are "Overview", then one section per group). Role-hidden items are dropped. */
export function useNavSections() {
  const { activeWorkspace } = useAuth();
  return useMemo(() => {
    const show = (items) => items.filter((item) => isVisibleTo(item, activeWorkspace));
    return [{ id: 'overview', label: 'Overview', icon: 'home', items: show(NAV.main) }, ...NAV.groups.map((g) => ({ id: g.label, label: g.label, icon: g.icon, panel: g.panel, items: show(g.items) }))]
      .filter((section) => section.items.length);
  }, [activeWorkspace]);
}

/** Panel rows are 44px: 22px icon, 15px label, optional "+" on the right; active = tinted. */
const ROW = 'flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-sidebar-ink outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring';
export const ROW_ACTION = 'grid size-9 shrink-0 place-items-center rounded-lg text-sidebar-muted outline-none hover:bg-sidebar-accent hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-ring';

/** A live count for items that have one (Chat shows its unread messages); otherwise the static `badge` from navigation.js. */
function useNavBadge(item) {
  const unread = useChatUnread();
  return item.to === '/app/chat' ? (unread > 0 ? (unread > 99 ? '99+' : unread) : null) : item.badge;
}

function PanelRow({ item }) {
  const { activeWorkspace } = useAuth();
  const badge = useNavBadge(item);
  const canCreate = item.create && hasRole(activeWorkspace?.role, 'member');
  return (
    <li className="flex items-center">
      <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(ROW, isActive && 'bg-sidebar-accent')}>
        <Icon name={item.icon} className="size-5.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {badge != null && <span className="rounded-md bg-sidebar-accent px-1.5 text-xs leading-5 text-sidebar-muted">{badge}</span>}
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

const containsPath = (node, pathname) => (node.to ? node.to === pathname : node.children?.some((c) => containsPath(c, pathname)));
const connector = 'relative pl-4 before:absolute before:left-0 before:top-5 before:h-px before:w-4 before:bg-line-strong'; // 20px = the middle of a 40px row, even when the row is a parent with its branch below

function TreeRow({ node, depth, forceOpen }) {
  const { pathname } = useLocation();
  const active = containsPath(node, pathname);
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]); // arriving from search or a link opens the branch that holds the page
  const nested = depth > 0;
  const label = <><span className="min-w-0 flex-1 truncate text-left">{node.label}</span></>;
  const icon = node.icon && <Icon name={node.icon} className="size-5.5 shrink-0" />;
  if (!node.children) {
    return <li className={nested ? connector : undefined}><NavLink to={node.to} className={({ isActive }) => cn(ROW, nested && 'h-10', 'w-full flex-none', isActive && 'bg-sidebar-accent')}>{icon}{label}</NavLink></li>;
  }
  const expanded = forceOpen || open;
  return (
    <li className={nested ? connector : undefined}>
      <button type="button" aria-expanded={expanded} onClick={() => setOpen((o) => !o)} className={cn(ROW, nested && 'h-10', 'w-full flex-none')}>
        {icon}{label}<Icon name={expanded ? 'minus' : 'plus'} className="size-5 shrink-0 text-sidebar-muted" />
      </button>
      {expanded && <ul className="ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-line-strong">{node.children.map((child) => <TreeRow key={child.id} node={child} depth={depth + 1} forceOpen={forceOpen} />)}</ul>}
    </li>
  );
}

/** Nested navigation of any depth (the Setup tree) in the same rows as the rest of the sidebar: a parent is an expandable row (+/−), its children hang on a connector line. */
export function NavTree({ nodes, forceOpen = false, label }) {
  return <ul aria-label={label} className="flex flex-col gap-0.5">{nodes.map((node) => <TreeRow key={node.id} node={node} depth={0} forceOpen={forceOpen} />)}</ul>;
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

