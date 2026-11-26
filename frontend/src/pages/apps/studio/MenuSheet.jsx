import { useState } from 'react';
import { appsApi } from '../../../api/endpoints.js';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { PromptDialog } from '../../../components/ui/PromptDialog.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Sheet } from '../../../components/ui/Sheet.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { ErrorBox } from '../../setup/objects/shared.jsx';
import { useStudio } from '../useApps.js';

const TYPE_ICON = { group: 'folder', page: 'file-search', link: 'link' };

/** The app's menu: groups, pages and links, in order. Every change is saved straight away. */
export function MenuSheet({ appKey, routes, meta, onClose }) {
  const { run } = useStudio();
  const [adding, setAdding] = useState(null); const [renaming, setRenaming] = useState(null); const [error, setError] = useState(null);
  const [linkUrl, setLinkUrl] = useState('https://');
  const send = (fn) => run(fn).then(() => setError(null)).catch((e) => { setError(e); throw e; });
  const groups = routes.filter((r) => r.type === 'group');
  const siblings = (r) => routes.filter((x) => (x.parentId ?? null) === (r.parentId ?? null));
  const reorder = (r, d) => { const list = siblings(r).map((x) => x.id); const i = list.indexOf(r.id); [list[i], list[i + d]] = [list[i + d], list[i]]; return send(() => appsApi.orderRoutes(list)); };
  const rows = [];
  const walk = (parent, depth) => routes.filter((r) => (r.parentId ?? null) === parent).forEach((r) => { rows.push({ r, depth }); walk(r.id, depth + 1); });
  walk(null, 0);
  return (
    <Sheet open onClose={onClose} width="w-[34rem]" icon="list" title="Menu" description="The pages of this app. Groups hold pages; links open an address.">
      <div className="space-y-4">
        <ErrorBox error={error} />
        <div className="flex flex-wrap gap-2">
          {[['group', 'Add a group'], ['page', 'Add a page'], ['link', 'Add a link']].map(([type, label]) => <Button key={type} size="sm" variant="neutral" onClick={() => setAdding(type)}><Icon name="plus" />{label}</Button>)}
        </div>
        {adding === 'link' && <Input label="Address for new links" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} hint="Used when you add a link." />}
        {rows.length === 0 && <p className="text-sm text-muted">The menu is empty.</p>}
        <ul className="space-y-1.5">
          {rows.map(({ r, depth }) => (
            <li key={r.id} className="space-y-2 rounded-lg border border-line bg-surface p-2.5" style={{ marginLeft: depth * 20 }}>
              <div className="flex items-center gap-2">
                <Icon name={r.icon || TYPE_ICON[r.type]} className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.title}</span><Badge>{r.type}</Badge>{r.hidden && <Badge tone="warning">Hidden</Badge>}
                <Button size="icon" variant="ghost" aria-label={`Move ${r.title} up`} disabled={siblings(r)[0]?.id === r.id} onClick={() => reorder(r, -1)}><Icon name="chevron-up" className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Move ${r.title} down`} disabled={siblings(r).at(-1)?.id === r.id} onClick={() => reorder(r, 1)}><Icon name="chevron-down" className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Rename ${r.title}`} onClick={() => setRenaming(r)}><Icon name="edit" className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${r.title}`} onClick={() => send(() => appsApi.deleteRoute(r.id))}><Icon name="trash" className="size-4" /></Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <Select aria-label={`Parent of ${r.title}`} placeholder="Top level" options={groups.filter((g) => g.id !== r.id).map((g) => ({ value: g.id, label: `In ${g.title}` }))} value={r.parentId ?? ''} onChange={(parentId) => send(() => appsApi.updateRoute(r.id, { parentId: parentId || null })).catch(() => {})} />
                <Switch label="Hidden" checked={r.hidden} onChange={(e) => send(() => appsApi.updateRoute(r.id, { hidden: e.target.checked }))} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <PromptDialog open={Boolean(adding)} title={adding === 'group' ? 'New group' : adding === 'link' ? 'New link' : 'New page'} confirmLabel="Add" onClose={() => setAdding(null)} onSubmit={(title) => send(() => appsApi.createRoute(appKey, { type: adding, title, icon: TYPE_ICON[adding] === 'folder' ? 'folder' : '', ...(adding === 'link' ? { linkUrl } : {}) }))} />
      <PromptDialog key={renaming?.id} open={Boolean(renaming)} title="Rename" initial={renaming?.title} onClose={() => setRenaming(null)} onSubmit={(title) => send(() => appsApi.updateRoute(renaming.id, { title }))} />
    </Sheet>
  );
}
