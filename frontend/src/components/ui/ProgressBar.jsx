import { cn } from '../../lib/cn.js';

const TONE = (pct) => (pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-accent');

/** Horizontal meter. `warn` colours it by how full it is (limits); otherwise it is the accent colour (shares/scores). */
export function ProgressBar({ value, label, warn = false, className }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cn('h-2 overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cn('h-full rounded-full transition-[width]', warn ? TONE(pct) : 'bg-accent')} style={{ width: `${pct}%` }} />
    </div>
  );
}
