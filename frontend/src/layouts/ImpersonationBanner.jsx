import { useState } from 'react';
import { Button } from '../components/ui/Button.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

/** Shown on every page while an administrator is acting as another member. */
export function ImpersonationBanner() {
  const { impersonatedBy, user, stopImpersonation } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!impersonatedBy) return null;
  return (
    <div role="status" className="flex h-9 shrink-0 items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 text-sm text-warning">
      <span className="min-w-0 flex-1 truncate">Viewing as {user.firstName} {user.lastName} ({user.email}). Account changes are disabled.</span>
      <Button size="sm" variant="neutral" loading={busy} onClick={async () => { setBusy(true); try { await stopImpersonation(); } finally { setBusy(false); } }}>Exit</Button>
    </div>
  );
}
