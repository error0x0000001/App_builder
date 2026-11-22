import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Hover/focus label rendered in a portal so scroll containers never clip it. */
export function Tooltip({ label, disabled = false, children }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  if (disabled || !label) return children;

  const show = () => {
    const rect = ref.current.getBoundingClientRect();
    setPosition({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  };
  return (
    <span ref={ref} className="block" onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)}>
      {children}
      {position && createPortal(
        <span role="tooltip" style={position} className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg shadow-md">{label}</span>,
        document.body,
      )}
    </span>
  );
}
