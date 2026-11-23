import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Untitled UI metric trend: an arrow and the change versus the previous period (green up, red down, grey when flat or unknown). */
export function TrendBadge({ value, previous, label = 'vs previous 7 days', inverse = false }) {
  if (previous == null) return null;
  const pct = previous === 0 ? (value === 0 ? 0 : 100) : Math.round(((value - previous) / previous) * 100);
  const up = pct > 0; const flat = pct === 0;
  const good = inverse ? !up : up;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-sm">
      <span className={cn('inline-flex items-center gap-0.5 font-semibold', flat ? 'text-muted' : good ? 'text-success' : 'text-danger')}>
        {!flat && <Icon name={up ? 'arrow-up' : 'arrow-down'} className="size-3.5" />}{Math.abs(pct)}%
      </span>
      <span className="text-muted">{label}</span>
    </span>
  );
}
