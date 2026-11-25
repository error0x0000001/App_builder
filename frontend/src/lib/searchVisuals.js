import { FILE_KIND_COLORS, FOLDER_COLOR, kindFromLabel } from './fileKinds.js';

/** Accent hue per CRM object (matches the order people know them by: warm for leads, cool for accounts …). */
const OBJECT_HUES = { Leads: 45, Accounts: 255, Contacts: 190, Opportunities: 150, Cases: 25, Campaigns: 335, Tasks: 285 };
const OBJECT_ICONS = { Leads: 'target', Accounts: 'building', Contacts: 'users', Opportunities: 'trend-up', Cases: 'life-buoy', Campaigns: 'megaphone', Tasks: 'check-square' };
/** Document colours by kind of document (the Setup collection's name). */
export const DOCUMENT_COLORS = { 'Email Templates': '#3b82f6', Letterheads: '#8b5cf6', 'Mail Merge Templates': '#22c55e', 'Asset Files': '#f97316', 'Post Templates': '#ec4899', 'Action Link Templates': '#14b8a6' };

const PAGE_HUE = 250; const SETUP_HUE = 65;

/**
 * How a search result is drawn: `{ type: 'person' }` (gradient avatar), `{ type: 'document', color }` (colourful page icon) or
 * `{ type: 'folder', color }` (colourful folder), `{ type: 'tile', icon, hue }` (soft coloured tile with a line icon — one colour per kind of thing).
 */
export function visualFor(item) {
  if (item.kind === 'person') return { type: 'person' };
  if (item.kind === 'file') return { type: 'document', color: FILE_KIND_COLORS[kindFromLabel(item.tag)] };
  if (item.kind === 'folder') return { type: 'folder', color: FOLDER_COLOR };
  if (item.kind === 'document') return { type: 'document', color: DOCUMENT_COLORS[item.tag] ?? '#3b82f6' };
  if (item.kind === 'record') return { type: 'tile', icon: OBJECT_ICONS[item.tag] ?? 'users', hue: OBJECT_HUES[item.tag] ?? 285 };
  if (item.kind === 'page' && item.tag === 'Page') return { type: 'tile', icon: 'home', hue: PAGE_HUE };
  return { type: 'tile', icon: 'sliders', hue: SETUP_HUE }; // Setup pages, settings and configuration records
}

/** Icon and hue for a chip label ("Accounts", "People", "Email Templates" …). */
export const chipVisual = (label) => {
  if (OBJECT_ICONS[label]) return { icon: OBJECT_ICONS[label], hue: OBJECT_HUES[label] };
  return { People: { icon: 'user', hue: 340 }, Records: { icon: 'users', hue: 255 }, Navigation: { icon: 'home', hue: PAGE_HUE }, Documents: { icon: 'file-search', hue: 215 }, Folder: { icon: 'folder', hue: 45 }, Pages: { icon: 'home', hue: PAGE_HUE },
    'Setup pages': { icon: 'sliders', hue: SETUP_HUE }, Settings: { icon: 'sliders', hue: SETUP_HUE }, Configuration: { icon: 'settings', hue: SETUP_HUE } }[label] ?? { icon: 'file-search', hue: 215 };
};
