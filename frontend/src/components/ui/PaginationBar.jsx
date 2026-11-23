import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { DropdownMenuLabel } from './DropdownMenu.jsx';
import { MenuChoice, RoundMenu } from './RoundMenu.jsx';

/**
 * Footer of a cursor-paged table: "11–20 of 134", rows-per-page menu, Previous / Next (Untitled UI "Pagination" footer).
 * Cursor paging has no random access, so there are no page numbers — only the neighbours of the page you are on.
 */
export function PaginationBar({ from, to, total, capped = false, hasPrev, hasNext, onPrev, onNext, busy = false, pageSize, pageSizes, onPageSize }) {
  const range = to === 0 ? '0 results' : `${from.toLocaleString()}–${to.toLocaleString()}${total != null ? ` of ${total.toLocaleString()}${capped ? '+' : ''}` : ''}`;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted" aria-live="polite">{range}</p>
      <div className="ml-auto flex items-center gap-3">
        {pageSizes && (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            Rows per page <span className="font-medium text-ink">{pageSize}</span>
            <RoundMenu icon="chevron-down" label="Rows per page" size="sm" align="end">
              <DropdownMenuLabel>Rows per page</DropdownMenuLabel>
              {pageSizes.map((n) => <MenuChoice key={n} selected={n === pageSize} onSelect={() => onPageSize(n)}>{n}</MenuChoice>)}
            </RoundMenu>
          </div>
        )}
        <Button size="sm" variant="secondary" disabled={!hasPrev || busy} onClick={onPrev}><Icon name="chevron-left" className="size-4" />Previous</Button>
        <Button size="sm" variant="secondary" disabled={!hasNext || busy} onClick={onNext}>Next<Icon name="chevron-right" className="size-4" /></Button>
      </div>
    </nav>
  );
}
