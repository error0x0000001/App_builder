import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hero, Kpi, KpiStrip } from './ui.jsx';
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
  const jobs = query.data?.jobs ?? [];
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
      <Hero icon="clock" color="orange" title="Schedules" subtitle="Commands and database backups on a cron schedule. Add them on a service’s Schedules tab.">
        <KpiStrip><Kpi icon="clock" color="orange" label="Schedules" value={jobs.length} /><Kpi icon="check-circle" color="success" label="Enabled" value={jobs.filter((j) => j.enabled).length} /><Kpi icon="database" color="purple" label="Backups" value={jobs.filter((j) => j.kind === 'backup').length} /><Kpi icon="terminal" color="blue" label="Commands" value={jobs.filter((j) => j.kind === 'command').length} /></KpiStrip>
      </Hero>
      {error && <Alert tone="error">{error}</Alert>}
      <DataTable columns={columns} rows={jobs} loading={query.isPending} empty="Nothing is scheduled." storageKey="dp-jobs" />
    </div>
  );
}
