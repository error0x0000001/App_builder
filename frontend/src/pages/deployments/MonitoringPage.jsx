import { useQueries, useQuery } from '@tanstack/react-query';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { AreaChart, ChartLegend } from '../../components/ui/charts/AreaChart.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { StatusBadge } from './parts.jsx';
import { Hero, Kpi, KpiStrip } from './ui.jsx';

function ServerCard({ server, metrics }) {
  const m = metrics ?? [];
  const last = m[m.length - 1];
  const mem = last?.memTotalMb ? Math.round((last.memUsedMb / last.memTotalMb) * 100) : 0;
  const disk = last?.diskTotalKb ? Math.round((last.diskUsedKb / last.diskTotalKb) * 100) : 0;
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><FeaturedIcon icon="server" color="brand" size="sm" /><div><h2 className="text-base font-semibold text-ink">{server.name}</h2><p className="text-xs text-muted">{server.host} · {server.services} service{server.services === 1 ? '' : 's'}</p></div></div><StatusBadge status={server.status} of="server" /></div>
      {last ? (
        <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
          <div className="space-y-4">
            {[['CPU', Math.round(last.cpu), `${Math.round(last.cpu)}%`], ['Memory', mem, `${last.memUsedMb} / ${last.memTotalMb} MB`], ['Disk', disk, `${(last.diskUsedKb / 1048576).toFixed(1)} / ${(last.diskTotalKb / 1048576).toFixed(1)} GB`]].map(([label, pct, text]) => (
              <div key={label}><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-ink">{label}</span><span className="text-muted">{text}</span></div><ProgressBar value={pct} label={label} warn /></div>
            ))}
          </div>
          <div>
            <ChartLegend items={[{ label: 'CPU %', color: 'var(--accent)' }, { label: 'Memory %', color: 'var(--fi-orange)' }]} />
            {m.length > 1 ? <AreaChart height={170} labels={m.map((x) => x.at)} format={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} every={Math.ceil(m.length / 5)} series={[{ key: 'cpu', label: 'CPU %', color: 'var(--accent)', values: m.map((x) => Math.round(x.cpu)) }, { key: 'mem', label: 'Memory %', color: 'var(--fi-orange)', values: m.map((x) => (x.memTotalMb ? Math.round((x.memUsedMb / x.memTotalMb) * 100) : 0)) }]} /> : <p className="py-8 text-sm text-muted">The chart fills in as the server is sampled every 5 minutes.</p>}
          </div>
        </div>
      ) : <p className="text-sm text-muted">{server.status === 'ready' ? 'Waiting for the first sample (every 5 minutes).' : 'Test the server to start collecting metrics.'}</p>}
    </section>
  );
}

/** Live and recent CPU, memory and disk for every server. */
export default function MonitoringPage() {
  const servers = useQuery({ queryKey: ['deployments', 'servers'], queryFn: deploymentsApi.servers, refetchInterval: 30_000 });
  const list = servers.data?.servers ?? [];
  const results = useQueries({ queries: list.map((s) => ({ queryKey: ['deployments', 'server-metrics', s.id, 6], queryFn: () => deploymentsApi.serverMetrics(s.id, 6), refetchInterval: 60_000 })) });
  const lastOf = (i) => { const m = results[i]?.data?.metrics ?? []; return m[m.length - 1]; };
  const avg = (kind) => { const v = list.map((_, i) => lastOf(i)).filter(Boolean).map((x) => (kind === 'cpu' ? x.cpu : x.memTotalMb ? (x.memUsedMb / x.memTotalMb) * 100 : 0)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
  return (
    <div className="space-y-4">
      <Hero icon="cpu" color="purple" title="Monitoring" subtitle="The last 6 hours on each server, sampled every 5 minutes.">
        <KpiStrip><Kpi icon="server" color="purple" label="Servers" value={list.length} /><Kpi icon="check-circle" color="success" label="Ready" value={list.filter((x) => x.status === 'ready').length} /><Kpi icon="cpu" color="orange" label="Avg CPU now" value={`${avg('cpu')}%`} /><Kpi icon="database" color="teal" label="Avg memory now" value={`${avg('mem')}%`} /></KpiStrip>
      </Hero>
      {servers.isError && <Alert tone="error">{servers.error.message}</Alert>}
      {!servers.isPending && list.length === 0 && <p className="py-10 text-center text-sm text-muted">Add a server to see its metrics.</p>}
      <div className="grid items-start gap-4 2xl:grid-cols-2">{list.map((s, i) => <ServerCard key={s.id} server={s} metrics={results[i]?.data?.metrics} />)}</div>
    </div>
  );
}
