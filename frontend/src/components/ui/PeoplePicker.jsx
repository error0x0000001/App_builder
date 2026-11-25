import { useQuery } from '@tanstack/react-query';
import { peopleApi } from '../../api/endpoints.js';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { useMemo, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { SearchInput } from './SearchInput.jsx';

/**
 * "Add people" search over the organisation's members (Documents sharing, chat, meetings). Typing opens a list of matches; `exclude` hides people
 * already chosen. Calls `onPick(person)` and clears itself.
 */
export function PeoplePicker({ label = 'Add people', placeholder = 'Add people by name or email', exclude = [], onPick, autoFocus = false, enabled = true }) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 200);
  const { data } = useQuery({ queryKey: ['people', q], queryFn: () => peopleApi.search(q), enabled: enabled && q.length >= 2, staleTime: 30_000 });
  const suggestions = useMemo(() => (data?.people ?? []).filter((p) => !exclude.includes(p.id)), [data, exclude]);
  const pick = (person) => { onPick(person); setSearch(''); };

  return (
    <div className="relative">
      <SearchInput label={label} placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} autoFocus={autoFocus} className="h-10 w-full" />
      {q.length >= 2 && (
        <ul role="listbox" aria-label="People" className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface p-1">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected="false" onClick={() => pick(p)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <Avatar name={p.name} src={p.avatar} size="size-7" />
                <span className="min-w-0"><span className="block truncate font-medium text-ink">{p.name}</span><span className="block truncate text-xs text-muted">{p.email}</span></span>
              </button>
            </li>
          ))}
          {!suggestions.length && <li className="px-3 py-2 text-sm text-muted">No matching people left to add</li>}
        </ul>
      )}
    </div>
  );
}
