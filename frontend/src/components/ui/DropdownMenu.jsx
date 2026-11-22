import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

const MenuContext = createContext(null);
const useMenu = () => useContext(MenuContext);

/**
 * Small accessible menu: click-outside / Escape to close, arrow-key navigation, focus returns to the trigger.
 * Compose: <DropdownMenu><DropdownMenuTrigger>{(props) => <button {...props}/>}</DropdownMenuTrigger><DropdownMenuContent>…
 */
export function DropdownMenu({ children, className }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!root.current?.contains(event.target)) close(); };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      close();
      root.current?.querySelector('[aria-haspopup="menu"]')?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  return (
    <MenuContext.Provider value={{ open, setOpen, close, menuId }}>
      <div ref={root} className={cn('relative', className)}>{children}</div>
    </MenuContext.Provider>
  );
}

/** Render-prop trigger: spreads the ARIA + click props onto whatever element you render. */
export function DropdownMenuTrigger({ children }) {
  const { open, setOpen, menuId } = useMenu();
  return children({ 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? menuId : undefined, 'data-open': open, onClick: () => setOpen((o) => !o) });
}

const POSITIONS = {
  bottom: { start: 'top-full left-0 mt-1', end: 'top-full right-0 mt-1' },
  top: { start: 'bottom-full left-0 mb-1', end: 'bottom-full right-0 mb-1' },
  right: { start: 'left-full top-0 ml-2', end: 'left-full bottom-0 ml-2' },
};

export function DropdownMenuContent({ side = 'bottom', align = 'start', className, children }) {
  const { open, menuId } = useMenu();
  const ref = useRef(null);
  useEffect(() => { if (open) ref.current?.querySelector('[role="menuitem"]')?.focus(); }, [open]);
  if (!open) return null;

  const onKeyDown = (event) => {
    const items = [...ref.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    items[(move + items.length) % items.length]?.focus();
  };

  return (
    <div ref={ref} id={menuId} role="menu" onKeyDown={onKeyDown} className={cn('absolute z-50 min-w-56 rounded-lg border border-line bg-surface p-1 text-ink', POSITIONS[side][align], className)}>
      {children}
    </div>
  );
}

export function DropdownMenuItem({ icon, onSelect, className, children }) {
  const { close } = useMenu();
  return (
    <button type="button" role="menuitem" tabIndex={-1} onClick={() => { onSelect?.(); close(); }} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-2 focus:bg-surface-2', className)}>
      {icon && <Icon name={icon} className="size-4 shrink-0 text-muted" />}
      {children}
    </button>
  );
}

export const DropdownMenuLabel = ({ className, children }) => <div className={cn('px-2 py-1.5 text-xs text-muted', className)}>{children}</div>;
export const DropdownMenuSeparator = () => <div role="separator" className="-mx-1 my-1 h-px bg-line" />;
