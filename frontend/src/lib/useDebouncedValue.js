import { useEffect, useState } from 'react';

/** Returns `value` after it has stopped changing for `delayMs` (search boxes: one request per pause, not per keystroke). */
export function useDebouncedValue(value, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
