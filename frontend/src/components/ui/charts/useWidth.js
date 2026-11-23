import { useEffect, useRef, useState } from 'react';

/** The rendered width of an element, kept up to date (charts draw at the pixel size they are shown at, so text never stretches). */
export function useWidth(initial = 600) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.ResizeObserver) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, Math.floor(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
