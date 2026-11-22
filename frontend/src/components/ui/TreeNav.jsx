import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/**
 * Collapsible tree. Node: { id, label, to?, children?, trailing? }. Leaves with `to` are router links; branches toggle.
 * `forceOpen` expands everything (used while filtering). `isOpenByDefault(node)` lets the caller open the active branch.
 */
export function TreeNav({ nodes, forceOpen = false, isOpenByDefault = () => false, label }) {
  return <ul aria-label={label} className="space-y-px">{nodes.map((node) => <TreeNode key={node.id} node={node} depth={0} forceOpen={forceOpen} isOpenByDefault={isOpenByDefault} />)}</ul>;
}

const ROW = 'flex h-8 w-full items-center gap-1.5 rounded-lg pr-2 text-left text-sm';

function TreeNode({ node, depth, forceOpen, isOpenByDefault }) {
  const [open, setOpen] = useState(() => isOpenByDefault(node));
  const indent = { paddingLeft: `${depth * 12 + 8}px` };
  const branch = Boolean(node.children?.length);
  const expanded = forceOpen || open;

  return (
    <li>
      {branch ? (
        <button type="button" aria-expanded={expanded} onClick={() => setOpen((v) => !v)} style={indent} className={cn(ROW, 'font-medium text-ink hover:bg-surface-2')}>
          <Icon name="chevron-right" className={cn('size-3.5 shrink-0 text-muted transition-transform', expanded && 'rotate-90')} />
          <span className="truncate">{node.label}</span>
          {node.trailing && <span className="ml-auto shrink-0 text-xs text-muted">{node.trailing}</span>}
        </button>
      ) : node.to ? (
        <NavLink to={node.to} style={indent} className={({ isActive }) => cn(ROW, 'pl-7', isActive ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
          <span className="truncate">{node.label}</span>
        </NavLink>
      ) : (
        <div style={indent} className={cn(ROW, 'text-ink')}>
          <span className="w-3.5 shrink-0" /><span className="truncate">{node.label}</span>
          {node.trailing && <span className="ml-auto shrink-0 text-xs text-muted">{node.trailing}</span>}
        </div>
      )}
      {branch && expanded && (
        <ul className="space-y-px">{node.children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} forceOpen={forceOpen} isOpenByDefault={isOpenByDefault} />)}</ul>
      )}
    </li>
  );
}
