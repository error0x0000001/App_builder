import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Pane, PaneGroup } from '../../components/ui/Panes.jsx';
import { cn } from '../../lib/cn.js';
import { useNavPanel } from '../../hooks/useNavPanel.js';
import { SetupTree } from './SetupTree.jsx';

/** Setup area: tree on the left, the selected page on the right. On phones the tree is its own screen. */
export default function SetupLayout() {
  const { pathname } = useLocation();
  const atRoot = pathname.replace(/\/$/, '') === '/app/setup';
  const navPanel = useNavPanel(); // the sidebar panel already carries the tree
  return (
    <PaneGroup>
      {!navPanel && <Pane as="aside" side="left" aria-label="Setup" className={cn('w-full shrink-0 flex-col lg:w-72', atRoot ? 'flex' : 'hidden lg:flex')}><SetupTree /></Pane>}
      <Pane as="section" className={cn('flex-1 overflow-y-auto', atRoot && 'hidden lg:block')}>
        <div className="space-y-5 px-4 pb-4 pt-5"><Outlet /></div>
      </Pane>
    </PaneGroup>
  );
}

/** /app/setup on desktop opens System Overview; on a phone it shows the tree. */
export function SetupHome() {
  return window.matchMedia('(min-width: 1024px)').matches ? <Navigate to="system-overview" replace /> : null;
}
