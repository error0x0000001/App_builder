import { Icon } from '../ui/Icon.jsx';

export function TrustStrip() {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface px-5 py-4 sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-link"><Icon name="shield" className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Protected sign-in</p>
        <p className="text-xs text-muted">Two-factor authentication · encrypted sessions · full audit trail</p>
      </div>
      <span className="hidden text-xs text-muted sm:block">© 2026 Quelli</span>
    </div>
  );
}
