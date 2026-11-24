import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCESS_LEVELS } from '@app/shared';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PeoplePicker } from '../../components/ui/PeoplePicker.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { useCan } from './parts.jsx';

const LEVELS = { viewer: ['Viewer', 'See projects, logs and stats'], deployer: ['Deployer', 'Also deploy, roll back, stop, start and run schedules'], manager: ['Manager', 'Also servers, secrets, configuration and access'] };

/** Who can use Deployments besides owners and admins (who always can). */
export default function AccessPage() {
  const can = useCan(); const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['deployments', 'access'], queryFn: deploymentsApi.access, enabled: can('manager') });
  const [error, setError] = useState(null);
  if (!can('manager')) return <Navigate to="/app/deployments" replace />;
  const rows = query.data?.access ?? [];
  const run = (fn) => async () => { setError(null); try { await fn(); await queryClient.invalidateQueries({ queryKey: ['deployments', 'access'] }); } catch (e) { setError(e.message); } };
  return (
    <div className="max-w-3xl space-y-5">
      <PageToolbar meta={<Link to="/app/deployments" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Deployments</Link>} />
      <div><h1 className="text-lg font-semibold text-ink">Access</h1><p className="text-sm text-muted">Owners and admins can always do everything. Give other members one of these levels.</p></div>
      <ul className="grid gap-2 sm:grid-cols-3">{Object.entries(LEVELS).map(([k, [name, text]]) => <li key={k} className="rounded-xl border border-line bg-surface p-3"><p className="text-sm font-semibold text-ink">{name}</p><p className="text-xs text-muted">{text}</p></li>)}</ul>
      {error && <Alert tone="error">{error}</Alert>}
      <PeoplePicker label="Add a member" placeholder="Find a member by name or email" exclude={rows.map((r) => r.userId)} onPick={(p) => run(() => deploymentsApi.setAccess({ userId: p.id, level: 'viewer' }))()} />
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.length === 0 && <li className="p-6 text-center text-sm text-muted">Nobody else has access yet.</li>}
        {rows.map((r) => (
          <li key={r.userId} className="flex items-center gap-3 p-3">
            <Avatar name={r.name} size="size-9" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{r.name}</p><p className="truncate text-xs text-muted">{r.email}</p></div>
            <Select aria-label={`Level for ${r.name}`} value={r.level} onChange={(level) => run(() => deploymentsApi.setAccess({ userId: r.userId, level }))()} options={ACCESS_LEVELS.map((l) => ({ value: l, label: LEVELS[l][0] }))} className="w-36" />
            <Button size="icon" variant="ghost" aria-label={`Remove ${r.name}`} onClick={run(() => deploymentsApi.removeAccess(r.userId))}><Icon name="trash" className="size-4" /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
