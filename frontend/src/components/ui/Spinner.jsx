import { cn } from '../../lib/cn.js';

export function Spinner({ className = 'size-4' }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const PageSpinner = () => (
  <div className="grid min-h-screen place-items-center text-muted"><Spinner className="size-8" /></div>
);
