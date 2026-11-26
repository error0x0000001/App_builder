import { useEffect, useState } from 'react';

/** A value that follows another one after it stops changing (typing in a search box). */
export function useDebouncedValue(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
