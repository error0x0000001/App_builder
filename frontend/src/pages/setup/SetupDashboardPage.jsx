import { useQuery } from '@tanstack/react-query';
import { setupMetricsQuery } from '../../api/queries.js';
import { Section } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { QueryState } from './QueryState.jsx';

/** A column named "#Foo" is numeric: right-aligned, label without the marker. */
const toColumns = (cols) => cols.map((label, i) => ({ key: String(i), label: label.replace(/^#/, ''), align: label.startsWith('#') ? 'right' : undefined }));

/** Dashboard template: stat cards, share bars and one table, straight from the metrics endpoint. */
export function Dashboard({ data }) {
  return (
    <div className="space-y-5">
      {data.cards?.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.cards.map((c) => <StatCard key={c.k} label={c.k} value={c.v} caption={c.s} />)}</div>}
      {data.bars?.length > 0 && (
        <Section title="Breakdown">
          <ul className="space-y-3">
            {data.bars.map(([label, pct]) => (
              <li key={label} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="truncate text-ink">{label}</span><ProgressBar value={pct} label={label} /><span className="text-right text-muted">{pct}%</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {data.table && <DataTable columns={toColumns(data.table.cols)} rows={data.table.rows.map((r, i) => ({ id: i, ...Object.fromEntries(r.map((v, c) => [String(c), v])) }))} />}
    </div>
  );
}

export default function SetupDashboardPage({ pageKey }) {
  const query = useQuery(setupMetricsQuery(pageKey));
  return <QueryState query={query}>{(data) => <Dashboard data={data} />}</QueryState>;
}
