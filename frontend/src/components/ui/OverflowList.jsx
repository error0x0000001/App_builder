import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * A row that shows as many items as fit and hands the rest to `renderOverflow(hiddenItems)` (a "More" menu).
 * Widths are measured from an invisible copy of every item, so the split follows the real rendered sizes and updates
 * when the container resizes. `reserve` = width kept free for the overflow trigger.
 */
export function OverflowList({ items, getKey, renderItem, renderOverflow, gap = 2, reserve = 88, className }) {
  const box = useRef(null);
  const meter = useRef(null);
  const [fit, setFit] = useState(items.length);

  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !meter.current) return;
      const widths = [...meter.current.children].map((c) => c.offsetWidth);
      const available = box.current.clientWidth;
      const total = widths.reduce((sum, w) => sum + w + gap, -gap);
      if (total <= available) { setFit(items.length); return; }
      let used = reserve; let count = 0;
      for (const w of widths) { if (used + w + gap > available) break; used += w + gap; count++; }
      setFit(count);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [items, gap, reserve]);

  const hidden = items.slice(fit);
  return (
    <div ref={box} className={cn('relative flex min-w-0 flex-1 items-center', className)} style={{ gap }}>
      {items.slice(0, fit).map((item) => <div key={getKey(item)} className="shrink-0">{renderItem(item)}</div>)}
      {hidden.length > 0 && <div className="shrink-0">{renderOverflow(hidden)}</div>}
      <div ref={meter} aria-hidden="true" inert="" className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap" style={{ gap }}>
        {items.map((item) => <div key={getKey(item)} className="shrink-0">{renderItem(item)}</div>)}
      </div>
    </div>
  );
}
