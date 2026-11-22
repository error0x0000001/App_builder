import { cn } from '../../lib/cn.js';
import { Card } from './Card.jsx';

const WIDTHS = { sm: 'max-w-[25rem]', md: 'max-w-xl', lg: 'max-w-2xl' };

/** The centred card every auth screen is built from. */
export function AuthCard({ title, description, width = 'sm', children, footer }) {
  return (
    <div className={cn('w-full', WIDTHS[width])}>
      <Card className="space-y-4">
        {(title || description) && (
          <header>
            {title && <h1 className="text-xl font-semibold text-ink">{title}</h1>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </header>
        )}
        {children}
      </Card>
      {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
