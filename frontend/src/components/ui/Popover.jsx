import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';

/**
 * Floating panel anchored to an element (select lists, calendars). Rendered in a portal so no parent can clip it, placed
 * below the anchor and flipped above when there is no room, and kept in place on scroll/resize. Escape and outside clicks
 * close it; Escape is captured so a surrounding dialog does not also close.
 */
export function Popover({ anchorRef, open, onClose, matchWidth = false, maxHeight = 288, className, children, ...rest }) {
  const ref = useRef(null);
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setStyle(null); return undefined; }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const height = Math.min(ref.current?.scrollHeight ?? maxHeight, maxHeight);
      const room = window.innerHeight - a.bottom;
      const above = room < height + 8 && a.top > room;
      const left = Math.max(8, Math.min(a.left, window.innerWidth - (ref.current?.offsetWidth ?? a.width) - 8));
      setStyle({ left, minWidth: a.width, width: matchWidth ? a.width : undefined, maxHeight: Math.max(120, Math.min(maxHeight, (above ? a.top : room) - 12)), ...(above ? { bottom: window.innerHeight - a.top + 4 } : { top: a.bottom + 4 }) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchorRef, matchWidth, maxHeight]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!ref.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) onClose(); };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation(); // don't also close a dialog that contains this popover
      onClose();
      anchorRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey, true); };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} style={style ?? { visibility: 'hidden', left: 0, top: 0 }} className={cn('fixed z-[80] overflow-auto rounded-lg border border-line bg-surface p-1 text-ink', className)} {...rest}>
      {children}
    </div>,
    document.body,
  );
}
