import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Checkbox } from './Checkbox.jsx';
import { Icon } from './Icon.jsx';
import { Spinner } from './Spinner.jsx';

const ALIGN = { right: 'text-right', center: 'text-center' };
const MIN_WIDTH = 72;
const DEFAULT_WIDTH = 180;
const SELECT_WIDTH = 44;

/** Column widths the user dragged, remembered per table (`storageKey`); never required — a broken store just means defaults. */
function useColumnWidths(columns, storageKey) {
  const read = () => { try { return storageKey ? JSON.parse(localStorage.getItem(`cb:cols:${storageKey}`) ?? '{}') : {}; } catch { return {}; } };
  const [saved, setSaved] = useState(read);
  useEffect(() => { setSaved(read()); }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const widthOf = (c) => Math.max(MIN_WIDTH, saved[c.key] ?? c.width ?? DEFAULT_WIDTH);
  const set = useCallback((key, width, persist) => {
    setSaved((s) => {
      const next = { ...s, [key]: Math.max(MIN_WIDTH, Math.round(width)) };
      if (persist && storageKey) { try { localStorage.setItem(`cb:cols:${storageKey}`, JSON.stringify(next)); } catch { /* storage unavailable */ } }
      return next;
    });
  }, [storageKey]);
  return { widthOf, set, widths: columns.map(widthOf) };
}

function ResizeHandle({ label, width, onResize }) {
  const start = useRef(null);
  const down = (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, w: width }; };
  const move = (e) => { if (start.current) onResize(start.current.w + e.clientX - start.current.x, false); };
  const up = (e) => { if (!start.current) return; onResize(start.current.w + e.clientX - start.current.x, true); start.current = null; e.currentTarget.releasePointerCapture(e.pointerId); };
  const key = (e) => { if (e.key === 'ArrowLeft') onResize(width - 16, true); else if (e.key === 'ArrowRight') onResize(width + 16, true); };
  return (
    <span
      role="separator" aria-orientation="vertical" aria-label={`Resize ${label}`} tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onKeyDown={key} onClick={(e) => e.stopPropagation()}
      className="group absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize touch-none justify-center outline-none"
    ><span className="h-full w-0.5 bg-transparent transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent" /></span>
  );
}

function SortIcon({ dir }) {
  return <Icon name={dir === 'asc' ? 'arrow-up' : dir === 'desc' ? 'arrow-down' : 'chevrons-up-down'} className={cn('size-3.5 shrink-0', dir ? 'text-accent' : 'text-placeholder')} />;
}

/**
 * Generic table: fixed column widths the user can drag to resize (remembered per `storageKey`), striped rows with a rule between
 * rows and vertical rules between cells (the header has none), optional server-driven sorting and row selection.
 * `columns`: [{ key, label, render?(row), align?, width?, sortable?, wrap?, className? }].
 * `sort` = { key, dir: 'asc' | 'desc' } and `onSort(key)` make columns with `sortable` clickable — the data layer does the sorting.
 * Selection: `{ selected:Set, onToggle(id), onToggleAll(checked) }`. Presentation only — no data logic.
 */
export function DataTable({ columns, rows, rowKey = 'id', selection, onRowClick, loading = false, empty = 'Nothing to show', footer, sort, onSort, storageKey, className }) {
  const allSelected = rows.length > 0 && rows.every((r) => selection?.selected.has(r[rowKey]));
  const { widthOf, set, widths } = useColumnWidths(columns, storageKey);
  const total = widths.reduce((a, b) => a + b, 0) + (selection ? SELECT_WIDTH : 0);
  const span = columns.length + (selection ? 1 : 0);
  return (
    <div className={cn('overflow-hidden rounded-lg border border-line-strong bg-surface', className)}>
      <div className="overflow-x-auto">
        <table className="table-fixed border-collapse text-sm" style={{ width: total, minWidth: '100%' }}>
          <colgroup>
            {selection && <col style={{ width: SELECT_WIDTH }} />}
            {columns.map((c, i) => <col key={c.key} style={{ width: widths[i] }} />)}
          </colgroup>
          <thead>
            <tr className="h-11 border-b border-line-strong bg-[color-mix(in_srgb,var(--ink)_9%,var(--surface))] text-left text-xs font-semibold uppercase tracking-wide text-ink">
              {selection && <th scope="col" className="pl-4 pr-0"><Checkbox aria-label="Select all" checked={allSelected} onChange={(e) => selection.onToggleAll(e.target.checked)} /></th>}
              {columns.map((c) => {
                const sortable = c.sortable && onSort;
                const dir = sort?.key === c.key ? sort.dir : undefined;
                return (
                  <th key={c.key} scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined} className={cn('relative px-4 font-semibold', ALIGN[c.align])}>
                    {sortable ? (
                      <button type="button" onClick={() => onSort(c.key)} title={`Sort by ${c.label}`} className={cn('inline-flex max-w-full items-center gap-1 rounded uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-accent', c.align === 'right' && 'flex-row-reverse')}>
                        <span className="truncate">{c.label}</span><SortIcon dir={dir} />
                      </button>
                    ) : <span className="block truncate">{c.label}</span>}
                    <ResizeHandle label={c.label} width={widthOf(c)} onResize={(w, persist) => set(c.key, w, persist)} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('h-14 border-t border-line-strong even:bg-[color-mix(in_srgb,var(--ink)_4.5%,var(--surface))]', onRowClick && 'cursor-pointer hover:bg-accent-soft')}
              >
                {selection && <td className="pl-4 pr-0" onClick={(e) => e.stopPropagation()}><Checkbox aria-label="Select row" checked={selection.selected.has(row[rowKey])} onChange={() => selection.onToggle(row[rowKey])} /></td>}
                {columns.map((c) => {
                  const value = c.render ? c.render(row) : row[c.key];
                  return <td key={c.key} title={!c.wrap && (typeof value === 'string' || typeof value === 'number') ? String(value) : undefined} className={cn('border-l border-line-strong px-4 py-1.5 text-ink first:border-l-0', c.wrap ? 'whitespace-normal break-words' : 'truncate', ALIGN[c.align], c.className)}>{value}</td>;
                })}
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr className="border-t border-line-strong"><td colSpan={span} className="px-3 py-10 text-center text-muted">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="flex justify-center border-t border-line-strong py-6"><Spinner /></div>}
      {footer && <div className="border-t border-line-strong px-3 py-2">{footer}</div>}
    </div>
  );
}
