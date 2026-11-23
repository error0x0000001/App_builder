const KEY = 'cloudbase.recentSearch';
const MAX = 5;

/** Last few results the person opened from global search (per browser; never required for anything to work). */
export function readRecent() {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.slice(0, MAX) : []; } catch { return []; }
}

export function rememberRecent(item) {
  const { id, kind, title, subtitle, tag, to } = item;
  try { localStorage.setItem(KEY, JSON.stringify([{ id, kind, title, subtitle, tag, to }, ...readRecent().filter((r) => r.id !== id)].slice(0, MAX))); } catch { /* storage unavailable */ }
}
