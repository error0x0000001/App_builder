import { formatBytes } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { driveApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { driveActions } from './driveActions.js';
import { cn } from '../../lib/cn.js';

export const DRIVE_VIEWS = [
  { view: 'my', label: 'My Drive', icon: 'hard-drive' }, { view: 'shared', label: 'Shared with me', icon: 'users' }, { view: 'recent', label: 'Recent', icon: 'clock' },
  { view: 'starred', label: 'Starred', icon: 'star' }, { view: 'trash', label: 'Trash', icon: 'trash' }, { view: 'all', label: 'All folders', icon: 'lock', admin: true },
];

/** The round "+" that creates things (same button as the chat list's). Its choices are carried out by the Documents page (see driveActions.js). */
export function DriveNewMenu({ className }) {
  return (
    <DropdownMenu className={className}>
      <DropdownMenuTrigger>{(props) => <Button {...props} size="icon" shape="round" className="size-10" aria-label="New"><Icon name="plus" className="size-5" /></Button>}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem icon="folder-plus" onSelect={() => driveActions.emit('newFolder')}>New folder</DropdownMenuItem>
        <DropdownMenuItem icon="upload" onSelect={() => driveActions.emit('upload')}>File upload</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Documents views (My Drive, Shared with me, Recent, Starred, Trash) with the storage meter. The state lives in the URL (?view / ?folder), so this works
 * wherever it is drawn: inside the sidebar panel (normal) or as the page's own column when the navigation has no panel. Rows match the navigation rows (44px).
 */
export function DocumentsNav() {
  const { activeWorkspace } = useAuth();
  const isAdmin = ['owner', 'admin'].includes(activeWorkspace?.role);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'my';
  const folderId = params.get('folder');
  const usage = useQuery({ queryKey: ['drive', 'usage'], queryFn: driveApi.usage, staleTime: 30_000 });
  const pct = usage.data ? (usage.data.used / usage.data.quota) * 100 : 0;
  // the search term lives in the URL (?q) so the page, the sidebar and a reload all agree; typing is debounced into it
  const urlQuery = params.get('q') ?? '';
  const [text, setText] = useState(urlQuery);
  useEffect(() => { setText(urlQuery); }, [urlQuery]);
  const typed = useDebouncedValue(text.trim(), 250);
  useEffect(() => {
    if (typed === urlQuery.trim()) return;
    setParams((current) => { const next = new URLSearchParams(current); if (typed) next.set('q', typed); else next.delete('q'); next.delete('file'); return next; }, { replace: true });
  }, [typed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <SearchInput label="Search Documents" placeholder="Search in Documents" value={text} onChange={(e) => setText(e.target.value)} onClear={() => setText('')} className="h-10 min-w-0 flex-1" />
        <DriveNewMenu />
      </div>
      <nav aria-label="Drive views" className="flex flex-col gap-0.5">
        {DRIVE_VIEWS.filter((n) => !n.admin || isAdmin).map((n) => {
          const active = view === n.view;
          return (
            <button key={n.view} type="button" aria-current={active ? 'page' : undefined} onClick={() => setParams(n.view === 'my' ? {} : { view: n.view })}
              className={cn('flex h-11 items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium text-ink outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring', active && 'bg-surface-2')}>
              <Icon name={n.icon} className="size-5.5 shrink-0" />{n.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 px-1 pb-1 text-xs text-muted">
        <ProgressBar value={pct} warn label="Storage used" className="h-1.5" />
        <p>{usage.data ? `${formatBytes(usage.data.used)} of ${formatBytes(usage.data.quota)} used` : ' '}</p>
      </div>
    </div>
  );
}
