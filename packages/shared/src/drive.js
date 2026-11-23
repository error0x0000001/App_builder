import { z } from 'zod';
import { uuidField } from './schemas/fields.js';

/** Documents (Drive): roles, validation and file-type detection shared by the API and the UI. */
export const DRIVE_ROLES = Object.freeze(['viewer', 'editor', 'manager']);
export const DRIVE_ROLE_LABELS = Object.freeze({ viewer: 'Viewer', editor: 'Editor', manager: 'Manager' });
export const DRIVE_VIEWS = Object.freeze(['folder', 'recent', 'starred', 'shared', 'trash', 'all']);

/** A file or folder name: 1–200 characters, no path separators or control characters. */
export const driveNameSchema = z.string().trim().min(1, 'Enter a name').max(200, 'That name is too long')
  .refine((v) => !/[\\/\u0000-\u001f]/.test(v) && v !== '.' && v !== '..', 'A name cannot contain / or \\');

export const createFolderSchema = z.object({ name: driveNameSchema, parentId: uuidField.nullable().optional() }).strict();
export const patchFolderSchema = z.object({ name: driveNameSchema.optional(), parentId: uuidField.nullable().optional() }).strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const patchFileSchema = z.object({ name: driveNameSchema.optional(), folderId: uuidField.optional() }).strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const copyFileSchema = z.object({ folderId: uuidField.optional(), name: driveNameSchema.optional() }).strict();
export const accessSchema = z.object({
  inherit: z.boolean().optional(),
  entries: z.array(z.object({ principalType: z.enum(['user', 'workspace']), principalId: uuidField, role: z.enum(DRIVE_ROLES) }).strict()).max(200),
}).strict();
export const starSchema = z.object({ type: z.enum(['folder', 'file']), id: uuidField, starred: z.boolean() }).strict();
export const driveListQuerySchema = z.object({
  view: z.enum(DRIVE_VIEWS).default('folder'),
  folder: uuidField.optional(),
  sort: z.enum(['name', 'modified']).default('name'),
  after: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  q: z.string().trim().max(100).optional(),
});
export const trashActionSchema = z.object({ type: z.enum(['folder', 'file']), id: uuidField }).strict();

const EXT = {
  image: 'png jpg jpeg gif webp bmp ico avif heic svg', pdf: 'pdf', document: 'doc docx odt rtf pages', spreadsheet: 'xls xlsx ods csv tsv numbers',
  presentation: 'ppt pptx odp key', video: 'mp4 mov webm mkv avi m4v', audio: 'mp3 wav ogg m4a flac aac', archive: 'zip rar 7z tar gz tgz bz2',
  code: 'js ts jsx tsx json html css xml yml yaml py rb go rs java c cpp h sh sql md', text: 'txt log',
};
const BY_EXT = Object.fromEntries(Object.entries(EXT).flatMap(([kind, list]) => list.split(' ').map((ext) => [ext, kind])));

/** image | pdf | document | spreadsheet | presentation | video | audio | archive | code | text | file */
export function fileKindOf(name = '', mime = '') {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (mime.startsWith('audio/')) return 'audio'; // a recording named .webm/.mp4 is audio when its type says so
  if (BY_EXT[ext]) return BY_EXT[ext];
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  return 'file';
}
export const FILE_KIND_LABELS = Object.freeze({ image: 'Image', pdf: 'PDF', document: 'Document', spreadsheet: 'Spreadsheet', presentation: 'Presentation', video: 'Video', audio: 'Audio', archive: 'Archive', code: 'Code', text: 'Text', file: 'File' });

/** Types the browser may render inline (never HTML/SVG/JS: those are always downloaded). */
export const INLINE_SAFE = Object.freeze(new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'application/pdf', 'text/plain', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm']));

export const formatBytes = (n) => {
  if (!Number.isFinite(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};
