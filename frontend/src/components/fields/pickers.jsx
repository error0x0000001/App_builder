import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { FormField, controlClass } from '../ui/FormField.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Popover } from '../ui/Popover.jsx';
import { SearchInput } from '../ui/SearchInput.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Tag } from '../ui/Tag.jsx';
import { Button } from '../ui/Button.jsx';

/**
 * A picker whose choices come from the server: the list is searched and limited there (`load(q)` → { items, available, reason }).
 * `multiple` keeps an array of values; single keeps one. Labels of chosen values are remembered locally only to show them.
 */
export function RemotePicker({ id, label, hint, error, required, value, onChange, load, cacheKey, multiple = false, disabled, placeholder = 'Select…', allowFree = false, labels: known = {} }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [seen, setSeen] = useState({});
  const query = useQuery({ queryKey: ['field-options', cacheKey, q], queryFn: () => load(q), enabled: open, staleTime: 15_000, placeholderData: (previous) => previous });
  const chosen = multiple ? (Array.isArray(value) ? value : []) : (value ? [value] : []);
  const labelOf = (v) => seen[v]?.label ?? known[v] ?? (typeof v === 'string' && v.length > 30 ? `${v.slice(0, 8)}…` : String(v));
  const pick = (item) => {
    setSeen((s) => ({ ...s, [item.value]: item }));
    if (multiple) onChange?.(chosen.includes(item.value) ? chosen.filter((v) => v !== item.value) : [...chosen, item.value]);
    else { onChange?.(item.value); setOpen(false); }
  };
  const free = allowFree && q.trim() && !query.data?.items?.some((i) => i.label.toLowerCase() === q.trim().toLowerCase());
  return (
    <FormField id={id} label={label} hint={hint} error={error} required={required}>
      <button ref={anchor} id={id} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className={cn(controlClass(error), 'flex min-h-10 w-full flex-wrap items-center gap-1.5 py-1.5 text-left disabled:opacity-60')}>
        {chosen.length === 0 && <span className="text-placeholder">{placeholder}</span>}
        {multiple ? chosen.map((v) => <Tag key={v} onClose={disabled ? undefined : () => onChange?.(chosen.filter((x) => x !== v))} closeLabel={`Remove ${labelOf(v)}`}>{labelOf(v)}</Tag>) : chosen.length > 0 && <span className="truncate text-ink">{labelOf(chosen[0])}</span>}
        <Icon name="chevron-down" className="ml-auto size-4 shrink-0 text-muted" />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} matchWidth className="rounded-xl border border-line bg-surface p-1.5">
        <div className="p-1"><SearchInput value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} label="Search choices" autoFocus /></div>
        <div role="listbox" aria-multiselectable={multiple || undefined} className="max-h-60 overflow-y-auto">
          {query.isFetching && !query.data && <div className="grid place-items-center py-4"><Spinner /></div>}
          {query.data?.available === false && <p className="px-3 py-3 text-sm text-muted">{query.data.reason}</p>}
          {query.data?.items?.map((item) => {
            const on = chosen.includes(item.value);
            return (
              <button key={item.value} type="button" role="option" aria-selected={on} onClick={() => pick(item)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                <span className="min-w-0 flex-1"><span className="block truncate text-ink">{item.label}</span>{(item.description || item.meta) && <span className="block truncate text-xs text-muted">{[item.description, item.meta].filter(Boolean).join(' · ')}</span>}</span>
                {on && <Icon name="check" className="size-4 text-link" />}
              </button>
            );
          })}
          {query.data?.available !== false && query.data?.items?.length === 0 && !free && <p className="px-3 py-3 text-sm text-muted">Nothing found.</p>}
          {free && <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => pick({ value: q.trim(), label: q.trim() })}><Icon name="plus" />Add “{q.trim()}”</Button>}
        </div>
      </Popover>
    </FormField>
  );
}
