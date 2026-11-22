import { Icon } from './Icon.jsx';

/** items: array of strings; the last is the current page. */
export function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item}-${i}`} className={`flex items-center gap-1.5 ${last ? '' : 'max-sm:hidden'}`}>
              <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-ink' : 'text-muted'}>{item}</span>
              {!last && <Icon name="chevron-right" className="size-3.5 text-muted" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
