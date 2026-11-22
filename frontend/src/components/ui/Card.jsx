import { cn } from '../../lib/cn.js';

export function Card({ as: Component = 'section', className, children, ...rest }) {
  return <Component className={cn('rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6', className)} {...rest}>{children}</Component>;
}

/** A titled block inside a page (settings sections, lists). */
export function Section({ title, description, action, children, className }) {
  return (
    <Card className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
