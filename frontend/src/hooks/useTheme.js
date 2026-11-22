import { useCallback, useSyncExternalStore } from 'react';
import { applyThemeMode, getThemeMode, subscribeThemeMode } from '../lib/themeMode.js';

const root = document.documentElement;
const subscribeResolved = (callback) => {
  const observer = new MutationObserver(callback);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

/** `theme` = what is showing (light | dark); `mode` = the choice (light | dark | system). `toggle` flips light/dark (sign-in pages). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeResolved, () => root.dataset.theme ?? 'light');
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeMode);
  const toggle = useCallback(() => applyThemeMode(root.dataset.theme === 'dark' ? 'light' : 'dark'), []);
  return { theme, mode, toggle };
}
