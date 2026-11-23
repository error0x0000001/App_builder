import { formatBytes } from '@app/shared';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { driveApi, download } from '../../api/endpoints.js';
import { cursorPagination } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { DropZone, useFilePicker } from '../../components/ui/FilePicker.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { useLocalStorageState } from '../../hooks/useLocalStorageState.js';
import { cn } from '../../lib/cn.js';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { DriveGrid, DriveList, keyOf } from './DriveItems.jsx';
import { MoveDialog } from './MoveDialog.jsx';
import { NameDialog } from './NameDialog.jsx';
import { PreviewDialog } from './PreviewDialog.jsx';
import { ShareDialog } from './ShareDialog.jsx';
import { UploadTray } from './UploadTray.jsx';
import { useUploads } from './useUploads.js';

const NAV = [
  { view: 'my', label: 'My Drive', icon: 'hard-drive' }, { view: 'shared', label: 'Shared with me', icon: 'users' }, { view: 'recent', label: 'Recent', icon: 'clock' },
  { view: 'starred', label: 'Starred', icon: 'star' }, { view: 'trash', label: 'Trash', icon: 'trash' }, { view: 'all', label: 'All folders', icon: 'lock', admin: true },
];
const SORTS = [{ value: 'name', label: 'Name' }, { value: 'modified', label: 'Last modified' }];
const LAYOUTS = [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }];
const TITLES = { shared: 'Shared with me', recent: 'Recent', starred: 'Starred', trash: 'Trash', all: 'All folders' };

/** Documents: the workspace Drive. State lives in the URL (?view, ?folder, ?file) so every place can be linked, shared and reloaded. */
export default function DocumentsPage() {
  const { activeWorkspace } = useAuth();
  const isAdmin = ['owner', 'admin'].includes(activeWorkspace?.role);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'my';
  const folderId = params.get('folder');
  const fileId = params.get('file');
  const [layout, setLayout] = useLocalStorageState('drive:layout', 'list');
  const [sort, setSort] = useLocalStorageState('drive:sort', 'name');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 250);
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null); // { type: 'newFolder' | 'rename' | 'move' | 'share' | 'delete', ... }

  const go = useCallback((next) => { setSelected(new Set()); setSearch(''); setParams(next, { replace: false }); }, [setParams]);
  const openFolder = (id) => go({ folder: id });
  const goView = (v) => go(v === 'my' ? {} : { view: v });

  const query = { view: folderId ? 'folder' : view === 'my' ? 'folder' : view, folder: folderId ?? undefined, sort, q: q || undefined };
  const listing = useInfiniteQuery({
    queryKey: ['drive', 'list', query],
    queryFn: ({ pageParam, signal }) => driveApi.list({ ...query, after: pageParam }, { signal }),
    ...cursorPagination,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const usage = useQuery({ queryKey: ['drive', 'usage'], queryFn: driveApi.usage, staleTime: 30_000 });

  const head = listing.data?.pages[0]?.folder ?? null;
  const folders = useMemo(() => [...new Map((listing.data?.pages ?? []).flatMap((p) => p.folders).map((f) => [f.id, f])).values()], [listing.data]);
  const files = useMemo(() => (listing.data?.pages ?? []).flatMap((p) => p.files), [listing.data]);
  const items = useMemo(() => [...folders, ...files], [folders, files]);
  const inTrash = view === 'trash' && !folderId;
  const role = head?.role ?? (folderId ? 'viewer' : 'manager');
  const canCreateHere = !inTrash && (folderId ? head?.kind === 'folder' && role !== 'viewer' : view === 'my');
  const canUploadHere = Boolean(folderId) && head?.kind === 'folder' && role !== 'viewer';

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['drive'] }), [queryClient]);
  const run = async (action) => { setNotice(null); try { await action(); await refresh(); } catch (e) { setNotice(e.message); } };

  const uploads = useUploads({ onDone: refresh });
  const startUpload = (picked) => { if (!canUploadHere) { setNotice('Open a folder you can edit to upload files.'); return; } uploads.add(picked, (file, options) => driveApi.upload(folderId, file, options)); };
  const picker = useFilePicker({ onPick: startUpload });

  const handlers = {
    open: (item) => (item.type === 'folder' ? openFolder(item.id) : setParams({ ...(folderId ? { folder: item.folderId } : { folder: item.folderId }), file: item.id })),
    download: (item) => run(() => download(`/drive/files/${item.id}/download`, item.name)),
    star: (item) => run(() => driveApi.star(item.type, item.id, !item.starred)),
    share: (item) => setDialog({ type: 'share', item }),
    rename: (item) => setDialog({ type: 'rename', item }),
    move: (item) => setDialog({ type: 'move', items: [item] }),
    copy: (item) => run(() => driveApi.copyFile(item.id)),
    trash: (item) => run(() => driveApi.trash(item.type, item.id)),
    restore: (item) => run(() => driveApi.restore(item.type, item.id)),
    deleteForever: (item) => setDialog({ type: 'delete', items: [item] }),
  };

  const toggle = (item) => setSelected((s) => { const next = new Set(s); const k = keyOf(item); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  const toggleAll = (on) => setSelected(on ? new Set(items.map(keyOf)) : new Set());
  const chosen = items.filter((i) => selected.has(keyOf(i)));
  const crumbs = head?.breadcrumbs ?? [];

  const previewFile = useMemo(() => files.find((f) => f.id === fileId) ?? null, [files, fileId]);
  const { data: fetchedFile } = useQuery({ queryKey: ['drive', 'file', fileId], queryFn: () => driveApi.file(fileId), enabled: Boolean(fileId) && !previewFile, retry: false });
  const shownFile = previewFile ?? fetchedFile?.file ?? null;
  const closePreview = () => { const next = new URLSearchParams(params); next.delete('file'); setParams(next); };
  const openPreview = (file) => { const next = new URLSearchParams(params); next.set('file', file.id); setParams(next, { replace: true }); };

  const empty = !listing.isPending && !items.length;
  const usedPct = usage.data ? (usage.data.used / usage.data.quota) * 100 : 0;
  const forbidden = listing.error?.status === 404 || listing.error?.status === 403;

  return (
    <DropZone onFiles={startUpload} disabled={!canUploadHere} className="flex h-full min-h-0">
      {picker.input}
      <aside aria-label="Documents navigation" className="hidden w-60 shrink-0 flex-col gap-4 border-r border-line p-3 md:flex">
        <DropdownMenu>
          <DropdownMenuTrigger>
            {(props) => <Button {...props} className="w-full justify-start"><Icon name="plus" className="size-4" />New</Button>}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52">
            <DropdownMenuItem icon="folder-plus" onSelect={() => setDialog({ type: 'newFolder' })}>New folder</DropdownMenuItem>
            {canUploadHere && <DropdownMenuItem icon="upload" onSelect={picker.open}>File upload</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <nav aria-label="Drive views" className="flex flex-col gap-0.5">
          {NAV.filter((n) => !n.admin || isAdmin).map((n) => {
            const active = (view === n.view && !folderId) || (n.view === 'my' && folderId && view === 'my');
            return (
              <button key={n.view} type="button" aria-current={active ? 'page' : undefined} onClick={() => goView(n.view)} className={cn('flex h-10 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-surface-2 text-ink' : 'text-ink')}>
                <Icon name={n.icon} className="size-5 shrink-0 text-muted" />{n.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 px-1 text-xs text-muted">
          <ProgressBar value={usedPct} warn label="Storage used" className="h-1.5" />
          <p>{usage.data ? `${formatBytes(usage.data.used)} of ${formatBytes(usage.data.quota)} used` : ' '}</p>
        </div>
      </aside>

      <section aria-label="Files" className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
            {folderId && head ? (
              <>
                <button type="button" onClick={() => goView('my')} className="rounded px-1 font-medium text-muted hover:text-ink">My Drive</button>
                {crumbs.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-1"><Icon name="chevron-right" className="size-3.5 text-muted" />
                    {i === crumbs.length - 1 ? <h2 className="px-1 font-semibold text-ink">{c.name}</h2> : <button type="button" onClick={() => openFolder(c.id)} className="rounded px-1 font-medium text-muted hover:text-ink">{c.name}</button>}
                  </span>
                ))}
              </>
            ) : <h2 className="px-1 font-semibold text-ink">{q ? `Results for “${q}”` : TITLES[view] ?? 'My Drive'}</h2>}
          </nav>
          <SearchInput label="Search Documents" placeholder="Search in Documents" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} className="h-9 w-full sm:w-64" />
          <div className="w-36"><Select aria-label="Sort by" size="sm" options={SORTS} value={sort} onChange={setSort} /></div>
          <SegmentedControl label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
        </div>

        {chosen.length > 0 && (
          <div role="toolbar" aria-label="Selection" className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/60 px-4 py-2 text-sm">
            <span className="font-medium text-ink">{chosen.length} selected</span>
            {inTrash ? (
              <>
                <Button size="sm" variant="neutral" onClick={() => run(async () => { for (const i of chosen) await driveApi.restore(i.type, i.id); setSelected(new Set()); })}><Icon name="restore" className="size-4" />Restore</Button>
                <Button size="sm" variant="neutral" onClick={() => setDialog({ type: 'delete', items: chosen })}><Icon name="trash" className="size-4" />Delete forever</Button>
              </>
            ) : role !== 'viewer' && (
              <>
                <Button size="sm" variant="neutral" onClick={() => setDialog({ type: 'move', items: chosen.filter((i) => i.type === 'file' ? !i.recordObject : i.kind === 'folder') })}><Icon name="move" className="size-4" />Move to…</Button>
                <Button size="sm" variant="neutral" onClick={() => run(async () => { for (const i of chosen) await driveApi.trash(i.type, i.id); setSelected(new Set()); })}><Icon name="trash" className="size-4" />Move to trash</Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {notice && <Alert tone="error" className="mb-3">{notice}</Alert>}
          {forbidden ? (
            <div className="grid place-items-center gap-3 py-24 text-center"><Icon name="lock" className="size-8 text-muted" /><p className="text-sm font-medium text-ink">This folder isn’t available</p><p className="max-w-xs text-sm text-muted">It may have been moved or deleted, or you don’t have access to it.</p><Button size="sm" variant="neutral" onClick={() => goView('my')}>Go to My Drive</Button></div>
          ) : listing.isPending ? <div className="flex justify-center py-24"><Spinner /></div> : empty ? (
            <div className="grid place-items-center gap-3 py-24 text-center">
              <Icon name={inTrash ? 'trash' : 'folder'} className="size-8 text-muted" />
              <p className="text-sm font-medium text-ink">{inTrash ? 'Trash is empty' : q ? 'No matching files or folders' : view !== 'my' && !folderId ? 'Nothing here yet' : folderId ? 'This folder is empty' : 'No folders yet'}</p>
              {!inTrash && !q && canCreateHere && <p className="max-w-xs text-sm text-muted">{canUploadHere ? 'Drag files here, or use New › File upload.' : 'Create a folder with New › New folder, then open it to add files.'}</p>}
              {canCreateHere && !q && <Button size="sm" onClick={() => (canUploadHere ? picker.open() : setDialog({ type: 'newFolder' }))}><Icon name={canUploadHere ? 'upload' : 'folder-plus'} className="size-4" />{canUploadHere ? 'Upload files' : 'New folder'}</Button>}
            </div>
          ) : (
            <>
              {layout === 'grid'
                ? <DriveGrid items={items} selected={selected} onToggle={toggle} onOpen={handlers.open} inTrash={inTrash} role={role} handlers={handlers} />
                : <DriveList items={items} selected={selected} onToggle={toggle} onToggleAll={toggleAll} onOpen={handlers.open} inTrash={inTrash} role={role} handlers={handlers} />}
              {listing.hasNextPage && <div className="flex justify-center pt-4"><Button size="sm" variant="neutral" loading={listing.isFetchingNextPage} onClick={() => listing.fetchNextPage()}>Load more</Button></div>}
            </>
          )}
        </div>
      </section>

      <UploadTray items={uploads.items} onCancel={uploads.cancel} onRetry={uploads.retry} onClear={uploads.clear} />

      <NameDialog open={dialog?.type === 'newFolder'} title="New folder" label="Folder name" initial="Untitled folder" submitLabel="Create" onClose={() => setDialog(null)}
        onSubmit={async (name) => { await driveApi.createFolder(name, folderId); await refresh(); }} />
      <NameDialog open={dialog?.type === 'rename'} title={`Rename ${dialog?.item?.type ?? ''}`} initial={dialog?.item?.name} onClose={() => setDialog(null)}
        onSubmit={async (name) => { const { item } = dialog; await (item.type === 'folder' ? driveApi.patchFolder(item.id, { name }) : driveApi.patchFile(item.id, { name })); await refresh(); }} />
      <MoveDialog open={dialog?.type === 'move'} items={dialog?.items ?? []} onClose={() => setDialog(null)}
        onMove={async (target) => { for (const i of dialog.items) await (i.type === 'folder' ? driveApi.patchFolder(i.id, { parentId: target }) : driveApi.patchFile(i.id, { folderId: target })); setSelected(new Set()); await refresh(); }} />
      <ShareDialog open={dialog?.type === 'share'} folder={dialog?.item} onClose={() => setDialog(null)} />
      <ConfirmDialog open={dialog?.type === 'delete'} danger confirmLabel="Delete forever" title={`Delete ${dialog?.items?.length === 1 ? `“${dialog.items[0].name}”` : `${dialog?.items?.length ?? 0} items`} forever?`}
        description="This can’t be undone. The files are removed from storage." onClose={() => setDialog(null)}
        onConfirm={async () => { for (const i of dialog.items) await driveApi.deleteForever(i.type, i.id); setSelected(new Set()); await refresh(); }} />
      <PreviewDialog file={shownFile} files={files.length ? files : shownFile ? [shownFile] : []} onClose={closePreview} onNavigate={openPreview} onDownload={(f) => handlers.download(f)} />
    </DropZone>
  );
}
