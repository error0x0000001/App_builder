import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { cn } from '../lib/cn.js';
import { NAV_ITEMS } from './navigation.js';

/** ⌘K / Ctrl+K: jump to any page. Lists whatever is in NAV, so new pages appear automatically. */
export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())), [query]);

  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);
  useEffect(() => setActive(0), [query]);

  const go = (item) => { onClose(); navigate(item.to); };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter' && results[active]) { event.preventDefault(); go(results[active]); }
  };

  return (
    <Dialog open={open} onClose={onClose} label="Search">
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Icon name="search" className="size-4 text-muted" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Search pages…" aria-label="Search pages" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
      </div>
      <ul role="listbox" aria-label="Results" className="max-h-72 overflow-y-auto p-2">
        {results.map((item, i) => (
          <li key={item.to} role="option" aria-selected={i === active}>
            <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(item)} className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm', i === active && 'bg-surface-2')}>
              <Icon name={item.icon} className="size-4 text-muted" />{item.label}
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No results</li>}
      </ul>
    </Dialog>
  );
}
