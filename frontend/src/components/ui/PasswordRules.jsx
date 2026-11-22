import { PASSWORD_RULES } from '@app/shared';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

/** Live checklist driven by the same rules the API enforces. */
export function PasswordRules({ value = '' }) {
  return (
    <ul className="space-y-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', ok ? 'text-success' : 'text-muted')}>
            <Icon name={ok ? 'check-circle' : 'info'} className="size-3.5" />
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
