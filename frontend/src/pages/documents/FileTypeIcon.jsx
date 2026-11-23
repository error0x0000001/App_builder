import { DocumentColorIcon, FolderColorIcon } from '../../components/ui/ColorIcons.jsx';
import { FILE_KIND_COLORS, FOLDER_COLOR } from '../../lib/fileKinds.js';

/** Colourful icon for a drive item (a folder, or a file coloured by its kind). `item.type` is 'folder' | 'file'. */
export function FileTypeIcon({ item, className = 'size-5' }) {
  if (item.type === 'folder') return <FolderColorIcon className={className} color={['records', 'record', 'chats', 'chat'].includes(item.kind) ? '#6366f1' : FOLDER_COLOR} />;
  return <DocumentColorIcon className={className} color={FILE_KIND_COLORS[item.kind] ?? FILE_KIND_COLORS.file} />;
}
