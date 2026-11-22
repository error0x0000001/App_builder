import { useCallback, useSyncExternalStore } from 'react';

const root = document.documentElement;
const subscribe = (callback) => {
  const observer = new MutationObserver(callback);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => root.dataset.theme ?? 'light');
  const toggle = useCallback(() => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
  }, []);
  return { theme, toggle };
}
