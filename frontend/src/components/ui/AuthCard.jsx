import { cn } from '../../lib/cn.js';

const WIDTHS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl' };

/** Heading + content block every auth screen is built from (sits directly on the panel). */
export function AuthCard({ title, description, width = 'sm', children, footer }) {
  return (
    <div className={cn('w-full space-y-6', WIDTHS[width])}>
      {(title || description) && (
        <header>
          {title && <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>}
          {description && <p className="mt-2 text-sm text-muted">{description}</p>}
        </header>
      )}
      <div className="space-y-4">{children}</div>
      {footer && <div className="text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
