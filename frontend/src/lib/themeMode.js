/**
 * Light / dark / system, applied to <html data-theme>. "system" follows the OS and updates live. The choice is mirrored in
 * localStorage so the page paints correctly before anything loads (see index.html); signed-in people also have it saved on
 * their account (see AuthProvider), so it follows them across devices.
 */
const KEY = 'theme';
const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

const read = () => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } };
let mode = read();

const paint = () => { root.dataset.theme = (mode === 'system' ? media.matches : mode === 'dark') ? 'dark' : 'light'; };
const notify = () => listeners.forEach((l) => l());

export function applyThemeMode(next) {
  mode = next;
  try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  paint();
  notify();
}

media.addEventListener('change', () => { if (mode === 'system') { paint(); notify(); } });
paint();

export const getThemeMode = () => mode;
export const subscribeThemeMode = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
