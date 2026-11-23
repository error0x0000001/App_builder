import { useEffect, useState } from 'react';
import { searchApi } from '../api/endpoints.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';

const DEBOUNCE_MS = 120;
const MIN_CHARS = 2;

/**
 * Server-side global search with typing in mind: waits 120 ms after the last keystroke, cancels the request it replaces
 * (so slow, stale answers never overwrite newer ones) and keeps the previous results on screen until the new ones arrive.
 * Returns { groups, loading, partial, searched } — `groups` is { records, people, navigation, documents } (arrays).
 */
export function useGlobalSearch(query, type, enabled) {
  const q = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const [state, setState] = useState({ groups: {}, partial: false, forQuery: '' });
  const [loading, setLoading] = useState(false);
  const active = enabled && q.length >= MIN_CHARS;

  useEffect(() => {
    if (!active) { setLoading(false); setState({ groups: {}, partial: false, forQuery: '' }); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    searchApi.search(q, type, controller.signal)
      .then((data) => { setState({ groups: data.groups, partial: data.partial, forQuery: q }); setLoading(false); })
      .catch((error) => { if (error.name !== 'AbortError') { setState({ groups: {}, partial: false, forQuery: q }); setLoading(false); } });
    return () => controller.abort();
  }, [active, q, type]);

  const pending = active && (loading || query.trim() !== q);
  return { ...state, loading: pending, searched: active && state.forQuery === q && !pending };
}
