import { matchPath, useLocation } from 'react-router-dom';
import { useApp } from '../pages/apps/useApps.js';
import { NavTree } from './NavRows.jsx';

/** The rail panel of a custom app: its menu (groups and pages), as the same rows the rest of the sidebar uses. */
export function AppPanel() {
  const { pathname } = useLocation();
  const appKey = matchPath('/app/a/:appKey/*', pathname)?.params.appKey;
  const app = useApp(appKey);
  const routes = app.data?.routes ?? [];
  const node = (r) => (r.type === 'group'
    ? { id: r.id, label: r.title, icon: r.icon || 'folder', children: routes.filter((c) => c.parentId === r.id && !c.hidden).map(node) }
    : { id: r.id, label: r.title, icon: r.icon || (r.type === 'link' ? 'link' : 'file-search'), to: `/app/a/${appKey}/${r.id}` });
  const nodes = routes.filter((r) => !r.parentId && !r.hidden).map(node).filter((n) => !n.children || n.children.length);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5">
      {nodes.length ? <NavTree nodes={nodes} label="App menu" /> : <p className="px-3 py-2 text-sm text-sidebar-muted">This app has no pages yet.</p>}
    </div>
  );
}
