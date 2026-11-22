import { cn } from '../../lib/cn.js';

const TONES = { neutral: 'bg-surface-2 text-muted', accent: 'bg-accent-soft text-link', success: 'bg-success/15 text-success', warning: 'bg-warning/15 text-warning', danger: 'bg-danger/15 text-danger' };

export const Badge = ({ tone = 'neutral', children }) => (
  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>
);
