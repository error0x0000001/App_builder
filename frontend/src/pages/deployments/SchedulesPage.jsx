import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { ago, useCan } from './parts.jsx';

/** Every schedule and backup across services; turn one off or run it now. */
export default function SchedulesPage() {
  const queryClient = useQueryClient(); const can = useCan();
  const query = useQuery({ queryKey: ['deployments', 'all-jobs'], queryFn: deploymentsApi.allJobs, refetchInterval: 15_000 });
  const [error, setError] = useState(null);
  const act = (fn) => async () => { setError(null); try { await fn(); await queryClient.invalidateQueries({ queryKey: ['deployments', 'all-jobs'] }); } catch (e) { setError(e.message); } };
  const columns = [
    { key: 'name', label: 'Schedule', width: 220, render: (j) => <span className="font-medium">{j.name}</span> },
    { key: 'service', label: 'Service', width: 200, render: (j) => <Link to={`/app/deployments/s/${j.serviceId}/schedules`} className="font-medium text-link hover:underline">{j.service}</Link> },
    { key: 'kind', label: 'Type', width: 110, render: (j) => <Badge tone={j.kind === 'backup' ? 'accent' : 'neutral'}>{j.kind}</Badge> },
    { key: 'cron', label: 'Cron (UTC)', width: 140, render: (j) => <span className="font-mono text-xs">{j.cron}</span> },
    { key: 'lastRunAt', label: 'Last run', width: 140, render: (j) => ago(j.lastRunAt) },
    { key: 'enabled', label: 'On', width: 80, render: (j) => <Switch checked={j.enabled} disabled={!can('manager')} aria-label={`${j.name} enabled`} onChange={(e) => act(() => deploymentsApi.updateJob(j.serviceId, j.id, { enabled: e.target.checked }))()} /> },
    { key: 'run', label: '', width: 110, align: 'right', render: (j) => can('deployer') && <Button size="sm" variant="neutral" onClick={act(() => deploymentsApi.runJob(j.serviceId, j.id))}>Run now</Button> },
  ];
  return (
    <div className="space-y-5">
      <div><h1 className="text-lg font-semibold text-ink">Schedules</h1><p className="text-sm text-muted">Commands and database backups that run on a cron schedule. Add them on a service’s Schedules tab.</p></div>
      {error && <Alert tone="error">{error}</Alert>}
      <DataTable columns={columns} rows={query.data?.jobs ?? []} loading={query.isPending} empty="Nothing is scheduled." storageKey="dp-jobs" />
    </div>
  );
}
