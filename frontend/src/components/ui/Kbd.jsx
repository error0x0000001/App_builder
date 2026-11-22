import { cn } from '../../lib/cn.js';

export const Kbd = ({ className, children }) => (
  <kbd className={cn('rounded-md border border-current/20 px-1.5 py-0.5 font-sans text-[10px] font-medium leading-none opacity-70', className)}>{children}</kbd>
);

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere. */
export const searchShortcutLabel = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K');
