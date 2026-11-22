import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

const TONES = {
  error: { box: 'border-danger/40 bg-danger/10 text-danger', icon: 'alert' },
  success: { box: 'border-success/40 bg-success/10 text-success', icon: 'check-circle' },
  info: { box: 'border-link/30 bg-accent-soft text-ink', icon: 'info' },
  warning: { box: 'border-warning/40 bg-warning/10 text-warning', icon: 'alert' },
};

export function Alert({ tone = 'info', title, children, className }) {
  const { box, icon } = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm', box, className)}>
      <Icon name={icon} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : undefined}>{children}</div>
      </div>
    </div>
  );
}
