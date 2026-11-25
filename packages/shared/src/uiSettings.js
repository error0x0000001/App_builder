import { z } from 'zod';
import { HEX_RE } from './color.js';
import { PALETTES } from './palettes.js';

/**
 * Tenant UI customization — the single registry behind the owner's "Customize" sheet, the API validation and the
 * app shell. Add an option here (+ its CSS if it is a colour) and it appears in the sheet and is validated and saved
 * automatically. `type`: 'choice' (segmented control) | 'swatch' (colour cards: each option has `colors` to preview) | 'color' (any colour from the
 * colour picker, `#rrggbb`; `default: null` = use the preset above it).
 */
export const UI_OPTIONS = Object.freeze([
  {
    key: 'layout', group: 'Navigation', label: 'Layout', type: 'choice', default: 'rail',
    description: 'Icon rail with a section panel, a classic sidebar, or a bar along the top (phones always use the slide-out menu).',
    options: [{ value: 'rail', label: 'Rail' }, { value: 'sidebar', label: 'Sidebar' }, { value: 'topbar', label: 'Top bar' }],
  },
  {
    key: 'variant', group: 'Navigation', label: 'Style', type: 'choice', default: 'flat',
    description: 'Flat: navigation and page side by side, divided by a border. Inset: the page is a rounded card on the navigation colour. Floating: both are separate rounded cards with a gap.',
    options: [{ value: 'flat', label: 'Flat' }, { value: 'inset', label: 'Inset' }, { value: 'floating', label: 'Floating' }],
  },
  {
    key: 'navColor', group: 'Colors', label: 'Navigation colour', type: 'swatch', default: 'default',
    description: 'Colour of the sidebar or top bar.',
    options: [
      { value: 'default', label: 'Default', colors: ['#f9fafb', '#101828'] },
      { value: 'navy', label: 'Navy', colors: ['#00072d', '#eaf0ff'] },
      { value: 'slate', label: 'Slate', colors: ['#1e293b', '#e2e8f0'] },
      { value: 'accent', label: 'Accent', colors: ['#18181b', '#ffffff'] },
    ],
  },
  {
    key: 'palette', group: 'Colors', label: 'Colour palette', type: 'choice', default: 'default', hidden: true,
    description: 'A whole-UI palette (page, cards, borders, text; light and dark). Chosen from Theme presets.',
    options: PALETTES.map(({ id, label }) => ({ value: id, label })),
  },
  {
    key: 'navHex', group: 'Colors', label: 'Custom navigation colour', type: 'color', default: null,
    description: 'Any colour for the sidebar or top bar. Overrides the presets above; text and icons adapt automatically.',
  },
  {
    key: 'accentHex', group: 'Colors', label: 'Custom accent colour', type: 'color', default: null, afterTheme: true,
    description: 'Any brand colour for buttons, links and focus rings. Overrides the accent colour above, in light and dark.',
  },
]);

/**
 * Complete colour looks the owner can apply in one click (Customize › Theme presets). Each is a patch of colour options only — layout and
 * style stay as chosen. Brand presets recolour navigation + accent; `kind: 'palette'` presets restyle the whole UI (see palettes.js).
 * `navHex`/`accentHex` null = the built-in light navigation / the organisation's accent theme (or the palette's own accent).
 */
export const UI_PRESETS = Object.freeze([
  { id: 'untitled', label: 'Untitled', description: 'The built-in look: light navigation, purple accent.', ui: { palette: 'default', navColor: 'default', navHex: null, accentHex: null } },
  { id: 'indigo', label: 'Indigo', description: 'Light navigation, indigo accent.', ui: { palette: 'default', navColor: 'default', navHex: null, accentHex: '#444ce7' } },
  { id: 'midnight', label: 'Midnight', description: 'Deep navy navigation, soft blue accent.', ui: { palette: 'default', navColor: 'default', navHex: '#00072d', accentHex: '#6b9bff' } },
  { id: 'ocean', label: 'Ocean', description: 'Dark teal-blue navigation, sky accent.', ui: { palette: 'default', navColor: 'default', navHex: '#0b4a6f', accentHex: '#0ba5ec' } },
  { id: 'forest', label: 'Forest', description: 'Deep green navigation, fresh green accent.', ui: { palette: 'default', navColor: 'default', navHex: '#0b3d2e', accentHex: '#12b76a' } },
  { id: 'sunset', label: 'Sunset', description: 'Warm brown navigation, orange accent.', ui: { palette: 'default', navColor: 'default', navHex: '#7a2e0e', accentHex: '#ef6820' } },
  { id: 'rose', label: 'Rose', description: 'Dark plum navigation, rose accent.', ui: { palette: 'default', navColor: 'default', navHex: '#4a1022', accentHex: '#f63d68' } },
  { id: 'graphite', label: 'Graphite', description: 'Charcoal navigation, charcoal accent.', ui: { palette: 'default', navColor: 'default', navHex: '#1d2939', accentHex: '#344054' } },
  { id: 'slack', label: 'Slack', description: 'Aubergine navigation, blue accent.', ui: { palette: 'default', navColor: 'default', navHex: '#3f0e40', accentHex: '#1264a3' } },
  ...PALETTES.filter((p) => p.light).map((p) => ({
    id: p.id, label: p.label, kind: 'palette', description: `${p.label}-inspired surfaces, borders, text and accent — light and dark.`, ui: { palette: p.id, navColor: 'default', navHex: null, accentHex: null },
  })),
]);

export const UI_DEFAULTS = Object.freeze(Object.fromEntries(UI_OPTIONS.map((o) => [o.key, o.default])));

const colorValue = z.string().regex(HEX_RE, 'Use a colour like #7f56d9').transform((v) => v.toLowerCase()).nullable();
const shape = Object.fromEntries(UI_OPTIONS.map((o) => [o.key, o.type === 'color' ? colorValue : z.enum(o.options.map((x) => x.value))]));

/** PATCH body: any subset of the options, nothing else. */
export const uiSettingsPatchSchema = z.object(shape).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** Stored settings (possibly from an older version) → a complete, valid set: unknown or invalid values fall back to defaults. */
export const resolveUiSettings = (stored) => Object.fromEntries(UI_OPTIONS.map((o) => {
  const value = stored?.[o.key];
  if (o.type === 'color') return [o.key, typeof value === 'string' && HEX_RE.test(value) ? value.toLowerCase() : o.default];
  return [o.key, o.options.some((x) => x.value === value) ? value : o.default];
}));

/** Personal (per-user) preferences, saved on the account so they follow the person across devices. */
export const THEME_MODES = Object.freeze([
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]);
export const userPreferencesSchema = z.object({ themeMode: z.enum(THEME_MODES.map((m) => m.value)) }).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
