import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setupTreeQuery } from '../../api/queries.js';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { TreeNav } from '../../components/ui/TreeNav.jsx';
import { filterNodes, toTreeNodes } from './tree.js';

const hasActive = (node, pathname) => (node.to ? node.to === pathname : node.children?.some((c) => hasActive(c, pathname)));

/** Quick Find + the Setup tree (keeps the active branch open). It renders in the sidebar panel; the Setup page draws it itself only when the navigation shows no panel. */
export function SetupTree() {
  const { pathname } = useLocation();
  const { data, isPending } = useQuery(setupTreeQuery);
  const [query, setQuery] = useState('');
  const nodes = useMemo(() => (data ? toTreeNodes(data.tree) : []), [data]);
  const visible = useMemo(() => filterNodes(nodes, query), [nodes, query]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3"><SearchInput value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} placeholder="Quick Find" label="Quick Find" className="h-10" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {isPending ? <div className="grid place-items-center py-8 text-muted"><Spinner /></div> : (
          <TreeNav nodes={visible} label="Setup pages" forceOpen={Boolean(query.trim())} isOpenByDefault={(node) => hasActive(node, pathname)} />
        )}
        {!isPending && !visible.length && <p className="px-2 py-6 text-center text-sm text-muted">No pages match “{query}”</p>}
      </div>
    </div>
  );
}
