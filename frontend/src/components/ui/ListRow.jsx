import { cn } from '../../lib/cn.js';

/** One row in a bordered list (sessions, members, activity, invitations). */
export const List = ({ children, className }) => <ul className={cn('divide-y divide-line overflow-hidden rounded-lg border border-line', className)}>{children}</ul>;

export function ListRow({ leading, title, subtitle, trailing }) {
  return (
    <li className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </li>
  );
}
