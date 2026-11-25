import { useQuery } from '@tanstack/react-query';
import { Hero, Kpi, KpiStrip } from './ui.jsx';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { KINDS, KindTile, StatusBadge, ago } from './parts.jsx';

/** Every service in the organisation in one table (Dokploy's "Overview"). */
export default function ServicesPage() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['deployments', 'all-services'], queryFn: deploymentsApi.allServices, refetchInterval: 10_000 });
  const [q, setQ] = useState('');
  const rows = useMemo(() => (query.data?.services ?? []).filter((s) => !q || `${s.name} ${s.project} ${s.environment} ${s.server ?? ''}`.toLowerCase().includes(q.toLowerCase())), [query.data, q]);
  const all = query.data?.services ?? [];
  const count = (st) => all.filter((x) => x.status === st).length;
  const columns = [
    { key: 'name', label: 'Service', width: 280, render: (s) => <span className="flex items-center gap-3"><KindTile kind={s.kind} /><span className="min-w-0"><span className="flex items-center gap-2 font-medium">{s.name}{s.previewBranch && <Badge tone="accent">Preview</Badge>}</span><span className="block text-xs text-muted">{KINDS[s.kind]?.label}</span></span></span> },
    { key: 'project', label: 'Project', width: 170 },
    { key: 'environment', label: 'Environment', width: 140, render: (s) => <Badge tone="neutral">{s.environment}</Badge> },
    { key: 'server', label: 'Server', width: 150, render: (s) => s.server ?? <span className="text-muted">—</span> },
    { key: 'status', label: 'Status', width: 140, render: (s) => <StatusBadge status={s.status} /> },
    { key: 'domains', label: 'Domains', width: 100, align: 'right' },
    { key: 'lastDeployedAt', label: 'Last deployed', width: 150, render: (s) => ago(s.lastDeployedAt) },
  ];
  return (
    <div className="space-y-5">
      <Hero icon="cube" color="blue" title="Services" subtitle="Applications, Compose stacks and databases across every project.">
        <KpiStrip><Kpi icon="cube" color="blue" label="All services" value={all.length} /><Kpi icon="check-circle" color="success" label="Running" value={count('done')} /><Kpi icon="alert" color={count('error') ? 'error' : 'gray'} label="Failing" value={count('error')} /><Kpi icon="stop-circle" color="orange" label="Stopped or idle" value={count('stopped') + count('idle')} /></KpiStrip>
      </Hero>
      <SearchInput label="Search services" placeholder="Search by name, project or server" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} className="h-10 max-w-md" />
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      <DataTable columns={columns} rows={rows} loading={query.isPending} empty="No services yet." onRowClick={(s) => navigate(`/app/deployments/s/${s.id}`)} storageKey="dp-services" />
    </div>
  );
}
