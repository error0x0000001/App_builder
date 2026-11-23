import { cn } from '../../lib/cn.js';
import { Checkbox } from './Checkbox.jsx';
import { Spinner } from './Spinner.jsx';

const ALIGN = { right: 'text-right', center: 'text-center' };

/**
 * Generic table. `columns`: [{ key, label, render?(row), align?, wrap?, className? }]. Optional row selection
 * (`selection = { selected:Set, onToggle(id), onToggleAll(checked) }`) and row click. Presentation only — no data logic.
 */
export function DataTable({ columns, rows, rowKey = 'id', selection, onRowClick, loading = false, empty = 'Nothing to show', footer, title, badge, actions, className }) {
  const allSelected = rows.length > 0 && rows.every((r) => selection?.selected.has(r[rowKey]));
  return (
    <div className={cn('overflow-hidden rounded-xl bg-surface ring-1 ring-line', className)}>
      {(title || actions) && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-5 md:px-6">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {badge != null && <span className="rounded-md px-1.5 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-line-strong">{badge}</span>}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="h-11 border-b border-line bg-surface text-left text-xs font-semibold text-placeholder">
              {selection && <th scope="col" className="w-10 pl-4 pr-0 md:pl-6"><Checkbox aria-label="Select all" checked={allSelected} onChange={(e) => selection.onToggleAll(e.target.checked)} /></th>}
              {columns.map((c) => <th key={c.key} scope="col" className={cn('whitespace-nowrap px-6 font-semibold first:pl-6', ALIGN[c.align])}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('h-12 odd:bg-surface-2/70', onRowClick && 'cursor-pointer hover:bg-surface-2')}
              >
                {selection && <td className="w-10 pl-4 pr-0 md:pl-6" onClick={(e) => e.stopPropagation()}><Checkbox aria-label="Select row" checked={selection.selected.has(row[rowKey])} onChange={() => selection.onToggle(row[rowKey])} /></td>}
                {columns.map((c) => <td key={c.key} className={cn('px-6 py-3.5 text-muted first:font-medium first:text-ink', c.wrap ? 'whitespace-normal break-words' : 'max-w-[28rem] truncate', ALIGN[c.align], c.className)}>{c.render ? c.render(row) : row[c.key]}</td>)}
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={columns.length + (selection ? 1 : 0)} className="px-3 py-10 text-center text-muted">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="flex justify-center border-t border-line py-6"><Spinner /></div>}
      {footer && <div className="border-t border-line px-4 py-3 md:px-6">{footer}</div>}
    </div>
  );
}
