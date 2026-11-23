import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';

/**
 * The "…" menu of a file or folder. `inTrash` swaps the actions for Restore / Delete forever. Folders managed by the system (Records and
 * its record folders) and record attachments cannot be renamed, moved or copied — they belong to their record.
 */
export function DriveItemMenu({ item, inTrash, role, handlers }) {
  const isFolder = item.type === 'folder';
  const managed = isFolder ? item.kind !== 'folder' : Boolean(item.recordObject);
  const canEdit = role !== 'viewer' && !inTrash;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => (
          <button type="button" aria-label={`Actions for ${item.name}`} {...props} className="grid size-8 place-items-center rounded-lg text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[open=true]:bg-surface-2">
            <Icon name="more-horizontal" className="size-4" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {inTrash ? (
          <>
            <DropdownMenuItem icon="restore" onSelect={() => handlers.restore(item)}>Restore</DropdownMenuItem>
            <DropdownMenuItem icon="trash" onSelect={() => handlers.deleteForever(item)}>Delete forever</DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem icon={isFolder ? 'folder' : 'eye'} onSelect={() => handlers.open(item)}>{isFolder ? 'Open' : 'Preview'}</DropdownMenuItem>
            {!isFolder && <DropdownMenuItem icon="download" onSelect={() => handlers.download(item)}>Download</DropdownMenuItem>}
            <DropdownMenuItem icon="star" onSelect={() => handlers.star(item)}>{item.starred ? 'Remove from starred' : 'Add to starred'}</DropdownMenuItem>
            {isFolder && item.kind === 'folder' && <DropdownMenuItem icon="share" onSelect={() => handlers.share(item)}>Share</DropdownMenuItem>}
            {canEdit && !managed && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon="edit" onSelect={() => handlers.rename(item)}>Rename</DropdownMenuItem>
                <DropdownMenuItem icon="move" onSelect={() => handlers.move(item)}>Move to…</DropdownMenuItem>
                {!isFolder && <DropdownMenuItem icon="copy" onSelect={() => handlers.copy(item)}>Make a copy</DropdownMenuItem>}
              </>
            )}
            {canEdit && (isFolder ? item.kind === 'folder' : true) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon="trash" onSelect={() => handlers.trash(item)}>Move to trash</DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
