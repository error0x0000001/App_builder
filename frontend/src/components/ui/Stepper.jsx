import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

export function Stepper({ steps, current }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold', done && 'border-accent bg-accent text-accent-ink', active && 'border-accent text-accent', !done && !active && 'border-line text-muted')}>
              {done ? <Icon name="check" className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('hidden text-xs font-medium sm:block', active ? 'text-ink' : 'text-muted')}>{step}</span>
            {i < steps.length - 1 && <span className={cn('h-px flex-1', done ? 'bg-accent' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}
