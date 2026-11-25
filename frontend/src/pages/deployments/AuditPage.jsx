import { useQuery } from '@tanstack/react-query';
import { Hero, Kpi, KpiStrip } from './ui.jsx';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { formatRelative } from '../../lib/format.js';

/** Who did what in Deployments (server changes, deploys, secret reveals, terminals…). */
export default function AuditPage() {
  const query = useQuery({ queryKey: ['deployments', 'audit'], queryFn: deploymentsApi.audit, refetchInterval: 20_000 });
  const rows = query.data?.audit ?? [];
  return (
    <div className="space-y-4">
      <Hero icon="shield" color="pink" title="Audit log" subtitle="The latest 100 actions in Deployments. Revealing a secret and opening a terminal are recorded here.">
        <KpiStrip><Kpi icon="activity" color="pink" label="Recent actions" value={rows.length} /><Kpi icon="user" color="blue" label="People" value={new Set(rows.map((r) => r.who)).size} /><Kpi icon="eye" color="orange" label="Secrets viewed" value={rows.filter((r) => /Viewed secrets/.test(r.summary)).length} /><Kpi icon="terminal" color="purple" label="Terminals opened" value={rows.filter((r) => /Opened a terminal|Ran a command/.test(r.summary)).length} /></KpiStrip>
      </Hero>
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.length === 0 && !query.isPending && <li className="p-6 text-center text-sm text-muted">Nothing yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 p-3"><Avatar name={r.who} size="size-8" /><p className="min-w-0 flex-1 text-sm text-ink"><span className="font-medium">{r.who}</span> <span className="text-muted">·</span> {r.summary}</p><time dateTime={r.at} className="shrink-0 text-xs text-muted">{formatRelative(r.at)}</time></li>
        ))}
      </ul>
    </div>
  );
}
