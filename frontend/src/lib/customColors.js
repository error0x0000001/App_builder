import { customColorCss } from '@app/shared';

const STYLE_ID = 'custom-colors';

/**
 * Applies the owner's colours to the page: one injected <style> with the derived tokens plus the two attributes that switch them on.
 * `ui` = resolved UI settings. Called on sign-in/changes, and while dragging in the colour picker for a live preview (nothing is saved).
 */
export function applyCustomColors(ui) {
  const root = document.documentElement;
  let style = document.getElementById(STYLE_ID);
  if (!style) { style = document.createElement('style'); style.id = STYLE_ID; document.head.appendChild(style); }
  style.textContent = customColorCss(ui ?? {});
  if (ui?.accentHex) root.dataset.accent = 'custom'; else delete root.dataset.accent;
  const nav = ui?.navHex ? 'custom' : ui?.navColor && ui.navColor !== 'default' ? ui.navColor : null;
  if (nav) root.dataset.navColor = nav; else delete root.dataset.navColor;
}
