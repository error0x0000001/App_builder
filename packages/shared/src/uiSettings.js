import { z } from 'zod';

/**
 * Workspace UI customization — the single registry behind the owner's "Customize" sheet, the API validation and the
 * app shell. Add an option here (+ its CSS if it is a colour) and it appears in the sheet and is validated and saved
 * automatically. `type`: 'choice' (segmented control) | 'swatch' (colour cards: each option has `colors` to preview).
 */
export const UI_OPTIONS = Object.freeze([
  {
    key: 'layout', group: 'Navigation', label: 'Layout', type: 'choice', default: 'sidebar',
    description: 'Side navigation, or a bar along the top (phones always use the slide-out menu).',
    options: [{ value: 'sidebar', label: 'Sidebar' }, { value: 'topbar', label: 'Top bar' }],
  },
  {
    key: 'variant', group: 'Navigation', label: 'Style', type: 'choice', default: 'inset',
    description: 'Inset sits flush with the page; floating is a bordered card with a gap.',
    options: [{ value: 'inset', label: 'Inset' }, { value: 'floating', label: 'Floating' }],
  },
  {
    key: 'navColor', group: 'Colors', label: 'Navigation colour', type: 'swatch', default: 'default',
    description: 'Colour of the sidebar or top bar.',
    options: [
      { value: 'default', label: 'Default', colors: ['#fafafa', '#18181b'] },
      { value: 'navy', label: 'Navy', colors: ['#00072d', '#eaf0ff'] },
      { value: 'slate', label: 'Slate', colors: ['#1e293b', '#e2e8f0'] },
      { value: 'accent', label: 'Accent', colors: ['#18181b', '#ffffff'] },
    ],
  },
]);

export const UI_DEFAULTS = Object.freeze(Object.fromEntries(UI_OPTIONS.map((o) => [o.key, o.default])));

const shape = Object.fromEntries(UI_OPTIONS.map((o) => [o.key, z.enum(o.options.map((x) => x.value))]));

/** PATCH body: any subset of the options, nothing else. */
export const uiSettingsPatchSchema = z.object(shape).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** Stored settings (possibly from an older version) → a complete, valid set: unknown or invalid values fall back to defaults. */
export const resolveUiSettings = (stored) => Object.fromEntries(UI_OPTIONS.map((o) => {
  const value = stored?.[o.key];
  return [o.key, o.options.some((x) => x.value === value) ? value : o.default];
}));

/** Personal (per-user) preferences, saved on the account so they follow the person across devices. */
export const THEME_MODES = Object.freeze([
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]);
export const userPreferencesSchema = z.object({ themeMode: z.enum(THEME_MODES.map((m) => m.value)) }).partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
