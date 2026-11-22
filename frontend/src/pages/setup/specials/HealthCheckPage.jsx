import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { setupApi } from '../../../api/endpoints.js';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Section } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { ProgressBar } from '../../../components/ui/ProgressBar.jsx';
import { QueryState } from '../QueryState.jsx';

const show = (v) => (v === true ? 'On' : v === false ? 'Off' : String(v));
const COLUMNS = [
  { key: 'label', label: 'Setting', wrap: true, className: 'min-w-48', render: (r) => <><span className="block">{r.label}</span><span className="block text-xs text-muted">{r.pageName}</span></> },
  { key: 'current', label: 'Your value', wrap: true, render: (r) => show(r.current) },
  { key: 'standard', label: 'Recommended', wrap: true, render: (r) => show(r.standard) },
  { key: 'ok', label: 'Status', render: (r) => (r.ok ? <Badge tone="success">Meets baseline</Badge> : <Badge tone={r.weight === 'high' ? 'danger' : 'warning'}>{r.weight === 'high' ? 'High risk' : 'Medium risk'}</Badge>) },
];

/** Security score from the real password and session settings; "Fix risks" applies the recommended values through the normal save path. */
export default function HealthCheckPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['setup', 'metrics', 'health-check'], queryFn: () => setupApi.metrics('health-check') });
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState(null);

  const fix = async () => {
    setFixing(true); setError(null);
    try {
      queryClient.setQueryData(['setup', 'metrics', 'health-check'], await setupApi.fixHealth('health-check'));
      await queryClient.invalidateQueries({ queryKey: ['setup', 'settings'] });
    } catch (e) { setError(e.message); } finally { setFixing(false); }
  };

  return (
    <QueryState query={query}>
      {(data) => (
        <div className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <Section title={`Health Check score: ${data.score}%`} action={data.risks.length > 0 && <Button size="sm" onClick={fix} loading={fixing}>Fix {data.risks.length} risk{data.risks.length === 1 ? '' : 's'}</Button>}>
            <ProgressBar value={data.score} label="Health Check score" className="h-3" />
            <p className="mt-2 text-sm text-muted">{data.risks.length ? 'Settings below the recommended baseline are listed first.' : 'Every checked setting meets the recommended baseline.'}</p>
          </Section>
          <DataTable columns={COLUMNS} rows={[...data.checks].sort((a, b) => a.ok - b.ok).map((c) => ({ id: `${c.page}.${c.key}`, ...c }))} />
        </div>
      )}
    </QueryState>
  );
}
