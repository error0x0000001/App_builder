import { FILE_KIND_LABELS } from '@app/shared';

/** One colour per kind of file (the colourful file icons in Documents and search). */
export const FILE_KIND_COLORS = Object.freeze({
  pdf: '#ef4444', image: '#22c55e', document: '#3b82f6', spreadsheet: '#16a34a', presentation: '#f97316', video: '#8b5cf6',
  audio: '#ec4899', archive: '#a16207', code: '#0ea5e9', text: '#64748b', file: '#94a3b8',
});
const KIND_BY_LABEL = Object.fromEntries(Object.entries(FILE_KIND_LABELS).map(([kind, label]) => [label, kind]));
export const kindFromLabel = (label) => KIND_BY_LABEL[label] ?? 'file';
export const FOLDER_COLOR = '#f59e0b';
