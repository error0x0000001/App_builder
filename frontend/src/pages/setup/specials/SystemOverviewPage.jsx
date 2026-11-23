import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { setupMetricsQuery } from '../../../api/queries.js';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { AreaChart, ChartLegend } from '../../../components/ui/charts/AreaChart.jsx';
import { Donut } from '../../../components/ui/charts/Donut.jsx';
import { MiniBars } from '../../../components/ui/charts/MiniBars.jsx';
import { Sparkline } from '../../../components/ui/charts/Sparkline.jsx';
import { FeaturedIcon } from '../../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { ProgressBar } from '../../../components/ui/ProgressBar.jsx';
import { TrendBadge } from '../../../components/ui/TrendBadge.jsx';
import { formatRelative } from '../../../lib/format.js';
import { QueryState } from '../QueryState.jsx';

const SHORT_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const shortDay = (iso) => SHORT_DAY.format(new Date(`${iso}T12:00:00Z`));
const SLICES = ['var(--accent)', 'var(--fi-blue)', 'var(--fi-teal)', 'var(--fi-orange)', 'var(--fi-pink)', 'var(--fi-purple)', 'var(--fi-indigo)'];
const TINT = { blue: 'var(--fi-blue)', success: 'var(--success)', purple: 'var(--fi-purple)', orange: 'var(--fi-orange)' };
const ACTION_TONE = { create: 'success', created: 'success', update: 'accent', updated: 'accent', delete: 'danger', deleted: 'danger' };

/** One KPI: a tinted icon, the number, its trend against the previous period, and a sparkline (Untitled UI "Metric item"). */
function Kpi({ icon, color, label, value, suffix, trend, series, note, to }) {
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-5">
      <div className="flex items-center gap-2.5">
        <FeaturedIcon icon={icon} color={color} size="sm" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{label}</h3>
        {to && <Link to={to} aria-label={`Open ${label}`} className="text-muted hover:text-ink"><Icon name="chevron-right" className="size-4" /></Link>}
      </div>
      <p className="text-3xl font-semibold leading-none text-ink">{value}{suffix && <span className="ml-1 text-base font-medium text-muted">{suffix}</span>}</p>
      {trend}
      {note}
      {series && <div className="mt-auto pt-1"><Sparkline values={series} color={TINT[color] ?? 'var(--accent)'} label={`${label}, last 14 days`} /></div>}
    </Card>
  );
}

const CardHeader = ({ title, description, action }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div className="min-w-0"><h2 className="text-base font-semibold text-ink">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted">{description}</p>}</div>
    {action}
  </div>
);

function Dashboard({ o }) {
  const kpi = Object.fromEntries(o.kpis.map((k) => [k.key, k]));
  const health = kpi.health;
  const healthColor = health.value >= 80 ? 'success' : health.value >= 50 ? 'warning' : 'error';
  const tone = (pct) => (pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'accent');
  return (
    <div className="space-y-4">
      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon="users" color="blue" label="Members" value={kpi.members.value} note={<p className="text-sm text-muted">People in this workspace</p>} to="/app/members" />
        <Kpi icon="user" color="success" label="Active users" value={kpi['active-users'].value} trend={<TrendBadge value={kpi['active-users'].series.slice(7).reduce((a, b) => a + b, 0)} previous={kpi['active-users'].previous} />} series={kpi['active-users'].series} />
        <Kpi icon="key" color="purple" label="Sign-ins" value={kpi.logins.value} trend={<TrendBadge value={kpi.logins.value} previous={kpi.logins.previous} />} series={kpi.logins.series} />
        <Kpi icon="edit" color="orange" label="Changes" value={kpi.changes.value} trend={<TrendBadge value={kpi.changes.value} previous={kpi.changes.previous} />} series={kpi.changes.series} />
        <Kpi
          icon="shield" color={healthColor} label="Security" value={health.value} suffix="/ 100" to="/app/setup/health-check"
          note={(
            <div className="space-y-2">
              <div role="progressbar" aria-valuenow={health.value} aria-valuemin={0} aria-valuemax={100} aria-label="Security health" className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${health.value}%`, background: `var(--${healthColor === 'error' ? 'danger' : healthColor})` }} /></div>
              <p className="text-sm text-muted">{health.failing ? `${health.failing} of ${health.total} checks need attention` : `All ${health.total} checks pass`}</p>
            </div>
          )}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Activity" description="Sign-ins and Setup changes, last 14 days" action={<ChartLegend items={[{ label: 'Sign-ins', color: 'var(--accent)' }, { label: 'Setup changes', color: 'var(--fi-orange)' }]} />} />
          <AreaChart
            labels={o.activity.map((d) => d.date)} format={shortDay}
            series={[{ key: 'logins', label: 'Sign-ins', color: 'var(--accent)', values: o.activity.map((d) => d.logins) }, { key: 'changes', label: 'Setup changes', color: 'var(--fi-orange)', values: o.activity.map((d) => d.changes) }]}
          />
        </Card>
        <Card>
          <CardHeader title="What your org is made of" description="Setup components by type" />
          {o.composition.length ? <Donut data={o.composition.map((c, i) => ({ label: c.label, value: c.count, color: SLICES[i % SLICES.length] }))} centerLabel="components" /> : <p className="py-10 text-center text-sm text-muted">Nothing configured yet.</p>}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent changes" description="The latest edits made in Setup" action={<Link to="/app/setup/view-setup-audit-trail" className="text-sm font-semibold text-link hover:underline">View audit trail</Link>} />
          {o.recent.length === 0 ? <p className="py-10 text-center text-sm text-muted">No changes have been made yet.</p> : (
            <ul className="divide-y divide-line" aria-label="Recent Setup changes">
              {o.recent.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar name={r.who.name} src={r.who.avatar} size="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm"><span className="font-medium text-ink">{r.who.name}</span><time dateTime={r.at} className="text-xs text-muted">{formatRelative(r.at)}</time></p>
                    <p className="text-sm text-muted">{r.summary} <Link to={`/app/setup/${r.pageKey}`} className="font-medium text-link hover:underline">{r.pageName}</Link></p>
                  </div>
                  <Badge tone={ACTION_TONE[String(r.action).toLowerCase()] ?? 'neutral'}>{r.action}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Needs attention" description="Security settings below the recommended baseline" action={<Link to="/app/setup/health-check" className="text-sm font-semibold text-link hover:underline">Health check</Link>} />
            {o.attention.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg bg-success/10 p-3"><FeaturedIcon icon="check-circle" color="success" size="sm" /><p className="text-sm font-medium text-ink">Every security check passes.</p></div>
            ) : (
              <ul className="space-y-3">
                {o.attention.map((a) => (
                  <li key={`${a.pageKey}:${a.label}`} className="flex items-start gap-3">
                    <FeaturedIcon icon="alert" color={a.weight === 'high' ? 'error' : 'warning'} size="sm" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{a.label}</p><p className="truncate text-xs text-muted">Now {a.current} · recommended {a.standard}</p></div>
                    <Link to={`/app/setup/${a.pageKey}`} aria-label={`Open ${a.pageName}`} className="mt-1 text-muted hover:text-ink"><Icon name="chevron-right" className="size-4" /></Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Usage and limits" description="API calls per hour, last 24 hours" />
            <MiniBars values={o.hourly} labels={o.hourly.map((_, i) => `${23 - i}h ago`)} />
            <ul className="mt-5 space-y-3.5">
              {o.gauges.map((g) => (
                <li key={g.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-ink">{g.label}</span><span className="text-xs text-muted">{g.text}</span></div>
                  <ProgressBar value={Math.max(g.pct, g.used > 0 ? 2 : 0)} warn label={g.label} className="h-1.5" />
                  <span className="sr-only">{g.pct}% used</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The Setup landing page: KPIs with trends, activity over time, what the org is made of, recent changes, what needs attention, and usage against limits. */
export default function SystemOverviewPage() {
  const query = useQuery(setupMetricsQuery('system-overview'));
  return <QueryState query={query}>{(data) => <Dashboard o={data} />}</QueryState>;
}
