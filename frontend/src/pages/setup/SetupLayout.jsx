import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { setupTreeQuery } from '../../api/queries.js';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { TreeNav } from '../../components/ui/TreeNav.jsx';
import { cn } from '../../lib/cn.js';
import { filterNodes, toTreeNodes } from './tree.js';

const hasActive = (node, pathname) => (node.to ? node.to === pathname : node.children?.some((c) => hasActive(c, pathname)));

/** Left pane: Quick Find + the Setup tree. Keeps the active branch open. */
function SetupTreePanel({ className }) {
  const { pathname } = useLocation();
  const { data, isPending } = useQuery(setupTreeQuery);
  const [query, setQuery] = useState('');
  const nodes = useMemo(() => (data ? toTreeNodes(data.tree) : []), [data]);
  const visible = useMemo(() => filterNodes(nodes, query), [nodes, query]);

  return (
    <aside aria-label="Setup" className={cn('flex min-h-0 w-full shrink-0 flex-col border-line lg:w-72 lg:border-r', className)}>
      <div className="p-3"><SearchInput value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} placeholder="Quick Find" label="Quick Find" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {isPending ? <div className="grid place-items-center py-8 text-muted"><Spinner /></div> : (
          <TreeNav nodes={visible} label="Setup pages" forceOpen={Boolean(query.trim())} isOpenByDefault={(node) => hasActive(node, pathname)} />
        )}
        {!isPending && !visible.length && <p className="px-2 py-6 text-center text-sm text-muted">No pages match “{query}”</p>}
      </div>
    </aside>
  );
}

/** Setup area: tree on the left, the selected page on the right. On phones the tree is its own screen. */
export default function SetupLayout() {
  const { pathname } = useLocation();
  const atRoot = pathname.replace(/\/$/, '') === '/app/setup';
  return (
    <div className="flex h-full min-h-0">
      <SetupTreePanel className={atRoot ? 'flex' : 'hidden lg:flex'} />
      <section className={cn('min-w-0 flex-1 overflow-y-auto', atRoot && 'hidden lg:block')}>
        <div className="space-y-5 px-4 pb-4 pt-5"><Outlet /></div>
      </section>
    </div>
  );
}

/** /app/setup on desktop opens System Overview; on a phone it shows the tree. */
export function SetupHome() {
  return window.matchMedia('(min-width: 1024px)').matches ? <Navigate to="system-overview" replace /> : null;
}
