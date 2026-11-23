import { formatBytes } from '@app/shared';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/format.js';
import { DriveItemMenu } from './DriveItemMenu.jsx';
import { FileTypeIcon } from './FileTypeIcon.jsx';

const keyOf = (item) => `${item.type}:${item.id}`;
export { keyOf };

const Star = ({ item }) => (item.starred ? <Icon name="star" className="size-3.5 shrink-0 fill-current text-warning" aria-label="Starred" /> : null);

/** The table view: icon + name, owner, modified, size. Click opens; the checkbox selects; "…" has the actions. */
export function DriveList({ items, selected, onToggle, onToggleAll, onOpen, inTrash, role, handlers }) {
  const all = items.length > 0 && items.every((i) => selected.has(keyOf(i)));
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="h-9 bg-surface-2 text-left text-xs font-medium text-muted">
            <th scope="col" className="w-10 px-3"><Checkbox aria-label="Select all" checked={all} onChange={(e) => onToggleAll(e.target.checked)} /></th>
            <th scope="col" className="w-full px-3 font-medium">Name</th>
            <th scope="col" className="hidden px-3 font-medium md:table-cell">Owner</th>
            <th scope="col" className="hidden whitespace-nowrap px-3 font-medium sm:table-cell">{inTrash ? 'Trashed' : 'Last modified'}</th>
            <th scope="col" className="hidden px-3 text-right font-medium lg:table-cell">Size</th>
            <th scope="col" className="w-12 px-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={keyOf(item)} aria-selected={selected.has(keyOf(item))} onClick={() => !inTrash && onOpen(item)} className={cn('h-12 border-t border-line', !inTrash && 'cursor-pointer', selected.has(keyOf(item)) ? 'bg-accent-soft/60' : 'hover:bg-surface-2/60')}>
              <td className="w-10 px-3" onClick={(e) => e.stopPropagation()}><Checkbox aria-label={`Select ${item.name}`} checked={selected.has(keyOf(item))} onChange={() => onToggle(item)} /></td>
              <td className="max-w-0 px-3">
                <div className="flex min-w-0 items-center gap-3"><FileTypeIcon item={item} /><span className="truncate font-medium text-ink">{item.name}</span><Star item={item} />{item.shared && <Icon name="users" className="size-3.5 shrink-0 text-muted" aria-label="Shared" />}</div>
              </td>
              <td className="hidden max-w-40 truncate px-3 text-muted md:table-cell">{item.ownerName ?? '—'}</td>
              <td className="hidden whitespace-nowrap px-3 text-muted sm:table-cell">{formatDate(inTrash ? item.trashedAt : item.updatedAt)}</td>
              <td className="hidden whitespace-nowrap px-3 text-right text-muted lg:table-cell">{item.type === 'file' ? formatBytes(item.size) : '—'}</td>
              <td className="w-12 px-2" onClick={(e) => e.stopPropagation()}><DriveItemMenu item={item} inTrash={inTrash} role={role} handlers={handlers} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The grid view: one card per item. */
export function DriveGrid({ items, selected, onToggle, onOpen, inTrash, role, handlers }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <li key={keyOf(item)} className={cn('group relative flex flex-col overflow-hidden rounded-xl border bg-surface', selected.has(keyOf(item)) ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2/60')}>
          <button type="button" onClick={() => !inTrash && onOpen(item)} className="flex flex-1 flex-col items-center gap-3 px-3 pb-3 pt-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FileTypeIcon item={item} className="size-12" />
            <span className="line-clamp-2 w-full break-words text-sm font-medium text-ink">{item.name}</span>
            <span className="text-xs text-muted">{item.type === 'file' ? `${formatBytes(item.size)} · ` : ''}{formatDate(inTrash ? item.trashedAt : item.updatedAt)}</span>
          </button>
          <div className="absolute left-2 top-2"><Checkbox aria-label={`Select ${item.name}`} checked={selected.has(keyOf(item))} onChange={() => onToggle(item)} /></div>
          <div className="absolute right-1 top-1 flex items-center"><Star item={item} /><DriveItemMenu item={item} inTrash={inTrash} role={role} handlers={handlers} /></div>
        </li>
      ))}
    </ul>
  );
}
