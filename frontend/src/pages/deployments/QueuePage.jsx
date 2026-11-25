import { useQuery } from '@tanstack/react-query';
import { Hero, Kpi, KpiStrip } from './ui.jsx';
import { useState } from 'react';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { DropdownMenuLabel } from '../../components/ui/DropdownMenu.jsx';
import { MenuChoice, RoundMenu } from '../../components/ui/RoundMenu.jsx';
import { LogSheet, StatusBadge, ago, duration } from './parts.jsx';

const STATUSES = [['', 'All'], ['running', 'Running'], ['done', 'Done'], ['error', 'Failed']];

/** Every deployment, newest first (Dokploy's "Deployments" queue). */
export default function QueuePage() {
  const [status, setStatus] = useState(''); const [open, setOpen] = useState(null);
  const query = useQuery({ queryKey: ['deployments', 'queue', status], queryFn: () => deploymentsApi.queue(status), refetchInterval: 4000 });
  const rows = query.data?.deployments ?? [];
  const n = (st) => rows.filter((d) => d.status === st).length;
  const columns = [
    { key: 'serviceName', label: 'Service', width: 220, render: (d) => <span className="font-medium">{d.serviceName ?? '—'}</span> },
    { key: 'title', label: 'Deployment', width: 260 },
    { key: 'status', label: 'Status', width: 130, render: (d) => <StatusBadge status={d.status} of="deployment" /> },
    { key: 'kind', label: 'Kind', width: 110, render: (d) => <Badge tone="neutral">{d.kind}</Badge> },
    { key: 'startedAt', label: 'Started', width: 150, render: (d) => ago(d.startedAt) },
    { key: 'took', label: 'Took', width: 90, render: (d) => duration(d.startedAt, d.finishedAt) },
  ];
  return (
    <div className="space-y-5">
      <Hero icon="activity" color="teal" title="Deployments" subtitle="Everything that has run or is running, across all services. Updates every few seconds."
        actions={<RoundMenu icon="filter" label="Filter by status" size="md" active={Boolean(status)}><DropdownMenuLabel>Status</DropdownMenuLabel>{STATUSES.map(([v, l]) => <MenuChoice key={v} selected={status === v} onSelect={() => setStatus(v)}>{l}</MenuChoice>)}</RoundMenu>}>
        <KpiStrip><Kpi icon="activity" color="teal" label="Shown" value={rows.length} /><Kpi icon="refresh" color="orange" label="Running now" value={n('running')} /><Kpi icon="check-circle" color="success" label="Done" value={n('done')} /><Kpi icon="alert" color={n('error') ? 'error' : 'gray'} label="Failed" value={n('error')} /></KpiStrip>
      </Hero>
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      <DataTable columns={columns} rows={rows} loading={query.isPending} empty="Nothing has been deployed yet." onRowClick={(d) => setOpen(d.id)} storageKey="dp-queue" />
      {open && <LogSheet deploymentId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
