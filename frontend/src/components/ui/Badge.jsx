import { cn } from '../../lib/cn.js';

const TONES = { neutral: 'border-line-strong bg-surface-2 text-ink', accent: 'border-accent/25 bg-accent-soft text-link', success: 'border-success/25 bg-success/10 text-success', warning: 'border-warning/30 bg-warning/10 text-warning', danger: 'border-danger/25 bg-danger/10 text-danger' };

export const Badge = ({ tone = 'neutral', children }) => (
  <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>
);
