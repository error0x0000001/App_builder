import { useQuery } from '@tanstack/react-query';
import { setupMetricsQuery } from '../../../api/queries.js';
import { Section } from '../../../components/ui/Card.jsx';
import { ProgressBar } from '../../../components/ui/ProgressBar.jsx';
import { QueryState } from '../QueryState.jsx';

/** Usage against limits: each gauge turns amber/red as it fills. */
export default function SystemOverviewPage() {
  const query = useQuery(setupMetricsQuery('system-overview'));
  return (
    <QueryState query={query}>
      {({ gauges }) => (
        <div className="grid gap-4 md:grid-cols-2">
          {gauges.map((g) => (
            <Section key={g.label} title={g.label}>
              <div className="space-y-2">
                <ProgressBar value={g.pct} warn label={g.label} />
                <p className="text-sm text-muted">{g.text} ({g.pct}%)</p>
              </div>
            </Section>
          ))}
        </div>
      )}
    </QueryState>
  );
}
