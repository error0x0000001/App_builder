import { sql } from 'drizzle-orm';
import { getSetupPage } from '@app/shared/setup-registry';
import { avatarUrl } from '../../shared/avatar.js';
import { uuidV7Floor } from '../../shared/ids.js';

const DAY_MS = 86_400_000;
const NS = (ws) => `m:${ws}`;
const DASH_TTL = { ttlMs: 60_000, staleMs: 5 * 60_000 };
const LOGIN_TYPES = sql`('login_success')`;
const n = (v) => Number(v).toLocaleString('en-US');
const bytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const pct = (part, whole) => (whole ? Math.min(100, Math.round((part / whole) * 100)) : 0);
const notEnabled = (title, note) => ({ cards: [{ k: title, v: 'Not enabled', s: note }], bars: [], table: null });

/** Dashboards: every number is computed from live data, cached ~60s per tenant (stale-while-revalidate, single-flight). */
export class MetricsService {
  constructor({ repos, db, cache, usage, health }) {
    Object.assign(this, { repos, db, cache, usage, health });
    this.providers = {
      'storage-usage': (ws) => this.#storage(ws),
      'platform-cache': () => this.#platformCache(),
      optimizer: (ws) => this.#optimizer(ws),
      'readiness-assessor': () => notEnabled('Einstein readiness', 'Scoring models are not enabled for this organisation'),
      'data-integration-metrics': (ws) => this.#integration(ws),
      'data-com-licenses-and-limits': () => notEnabled('Data.com', 'This add-on is not part of Quelli'),
      'lightning-experience-transition-assistant': () => notEnabled('Transition assistant', 'Not applicable — every user is already on the current experience'),
    };
  }

  hasProvider = (key) => key in this.providers;

  dashboard(ws, key) {
    return this.cache.remember(NS(ws), `d:${key}`, DASH_TTL, () => this.providers[key](ws));
  }

  overview(ws) {
    return this.cache.remember(NS(ws), 'overview', DASH_TTL, () => this.#overview(ws));
  }

  async #countEvents(ws, sinceMs, distinctUsers = false) {
    const { rows } = await this.db.execute(sql`
      select count(${distinctUsers ? sql`distinct user_id` : sql`*`})::int as n from (
        select user_id from auth_events where tenant_id = ${ws} and id >= ${uuidV7Floor(Date.now() - sinceMs)}::uuid and type in ${LOGIN_TYPES} limit 100000) e`);
    return rows[0].n;
  }

  async #storage(ws) {
    const rows = await this.repos.setupRecords.storageByCollection(ws);
    const total = rows.reduce((s, r) => s + r.bytes, 0); const count = rows.reduce((s, r) => s + r.n, 0);
    const LIMIT = 5e9;
    return {
      cards: [
        { k: 'Data Storage', v: bytes(total), s: `of 5.0 GB (${((total / LIMIT) * 100).toFixed(2)}%)` },
        { k: 'Records', v: n(count), s: `${n(rows.length)} collections` },
      ],
      bars: rows.slice(0, 5).map((r) => [r.collection, pct(r.bytes, total)]),
      table: { cols: ['Collection', '#Record Count', '#Storage', '#Percent'], rows: rows.slice(0, 25).map((r) => [r.collection, n(r.n), bytes(r.bytes), `${((r.bytes / (total || 1)) * 100).toFixed(1)}%`]) },
    };
  }

  /** Process-level cache statistics (this node), not tenant data. */
  #platformCache() {
    const s = this.cache.snapshot();
    const reads = s.l1Hits + s.l2Hits + s.misses || 1;
    return {
      cards: [
        { k: 'Provider', v: s.mode === 'redis+memory' ? 'Redis + memory' : 'Memory', s: 'per-node statistics' },
        { k: 'Entries (memory)', v: n(s.l1Entries) },
        { k: 'Hit ratio', v: `${Math.round(((s.l1Hits + s.l2Hits) / reads) * 100)}%`, s: `${n(s.misses)} misses` },
      ],
      bars: [['Memory hits', pct(s.l1Hits, reads)], ['Redis hits', pct(s.l2Hits, reads)], ['Misses', pct(s.misses, reads)]],
      table: null,
    };
  }

  async #optimizer(ws) {
    const [health, changes] = await Promise.all([this.health.evaluate(ws), this.db.execute(sql`select count(*)::int as n from (select 1 from setup_audit where tenant_id = ${ws} and id >= ${uuidV7Floor(Date.now() - 30 * DAY_MS)}::uuid limit 10000) a`)]);
    const grade = health.score >= 90 ? 'A' : health.score >= 75 ? 'B' : health.score >= 50 ? 'C' : 'D';
    return {
      cards: [
        { k: 'Recommendations', v: String(health.risks.length), s: 'from Health Check' },
        { k: 'Security grade', v: grade, s: `${health.score}% of baseline met` },
        { k: 'Setup changes (30 days)', v: n(changes.rows[0].n) },
      ],
      bars: [...Map.groupBy(health.checks, (c) => c.pageName)].map(([name, items]) => [name, pct(items.filter((c) => c.ok).length, items.length)]),
      table: null,
    };
  }

  async #integration(ws) {
    const counts = await this.repos.setupRecords.countsByCollection(ws, ['data-integration-rules', 'duplicate-rules', 'matching-rules']);
    return { cards: [{ k: 'Integration rules', v: n(counts['data-integration-rules'] ?? 0) }, { k: 'Duplicate rules', v: n(counts['duplicate-rules'] ?? 0) }, { k: 'Matching rules', v: n(counts['matching-rules'] ?? 0) }], bars: [], table: null };
  }

  /** The Setup landing dashboard: limits, KPIs with trends, 14 days of activity, what the organisation is made of, recent changes and what needs attention. */
  async #overview(ws) {
    const COMPONENTS = [['profiles', 'Profiles'], ['roles', 'Roles'], ['permission-sets', 'Permission sets'], ['flows', 'Flows'], ['workflow-rules', 'Workflow rules'], ['validation-rules', 'Validation rules'], ['apex-triggers', 'Triggers']];
    const day = (ms) => new Date(ms).toISOString().slice(0, 10);
    const since = uuidV7Floor(Date.now() - 14 * DAY_MS);
    const [counts, storage, api, hourly, loginRows, changeRows, recentRows, members, health] = await Promise.all([
      this.repos.setupRecords.countsByCollection(ws, ['object-manager-objects', 'object-manager-fields', 'workflow-rules', 'flows', 'apex-triggers', 'validation-rules', 'profiles', 'permission-sets', 'roles']),
      this.repos.setupRecords.storageByCollection(ws), this.usage.last24h(ws), this.usage.hourly24(ws),
      this.db.execute(sql`select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as d, count(*)::int as n, count(distinct user_id)::int as u from auth_events
        where tenant_id = ${ws} and id >= ${since}::uuid and type = 'login_success' group by 1`),
      this.db.execute(sql`select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as d, count(*)::int as n, count(distinct user_id)::int as u from setup_audit
        where tenant_id = ${ws} and id >= ${since}::uuid group by 1`),
      this.db.execute(sql`select a.id, a.page_key, a.action, a.summary, a.created_at, u.id as user_id, u.first_name, u.last_name, u.email, u.avatar_version
        from setup_audit a left join users u on u.id = a.user_id where a.tenant_id = ${ws} order by a.id desc limit 8`),
      this.repos.memberships.countMembers(ws), this.health.evaluate(ws),
    ]);
    const stored = storage.reduce((s, r) => s + r.bytes, 0);
    const custom = await this.db.execute(sql`select count(*)::int as n from setup_records where tenant_id = ${ws} and collection = 'object-manager-objects' and status = 'Custom'`);
    const gauge = (label, used, limit, fmt = n) => ({ label, used, limit, pct: pct(used, limit), text: `${fmt(used)} of ${fmt(limit)}` });

    const days = Array.from({ length: 14 }, (_, i) => day(Date.now() - (13 - i) * DAY_MS));
    const by = (rows) => new Map(rows.rows.map((r) => [r.d, r]));
    const logins = by(loginRows); const changes = by(changeRows);
    const series = (map, field) => days.map((d) => map.get(d)?.[field] ?? 0);
    const sum = (list) => list.reduce((a, b) => a + b, 0);
    const kpi = (key, label, values) => ({ key, label, value: sum(values.slice(7)), previous: sum(values.slice(0, 7)), series: values });
    const loginSeries = series(logins, 'n'); const changeSeries = series(changes, 'n'); const userSeries = series(logins, 'u');
    const activeUsers = kpi('active-users', 'Active users', userSeries);
    activeUsers.value = (await this.db.execute(sql`select count(distinct user_id)::int as n from auth_events where tenant_id = ${ws} and id >= ${uuidV7Floor(Date.now() - 7 * DAY_MS)}::uuid and type = 'login_success'`)).rows[0].n;

    return {
      gauges: [
        gauge('Custom objects', custom.rows[0].n, 2000), gauge('Custom fields', counts['object-manager-fields'] ?? 0, 100_000),
        gauge('Data storage', stored, 5e9, bytes), gauge('API requests (24h)', api, 1_000_000),
        gauge('Flows', counts.flows ?? 0, 2000), gauge('Workflow rules', counts['workflow-rules'] ?? 0, 500),
        gauge('Profiles', counts.profiles ?? 0, 1000), gauge('Permission sets', counts['permission-sets'] ?? 0, 1500),
      ],
      kpis: [
        { key: 'members', label: 'Members', value: members, previous: null, series: null },
        activeUsers, kpi('logins', 'Sign-ins', loginSeries), kpi('changes', 'Setup changes', changeSeries),
        { key: 'health', label: 'Security health', value: health.score, previous: null, series: null, failing: health.risks.length, total: health.checks.length },
      ],
      activity: days.map((d, i) => ({ date: d, logins: loginSeries[i], changes: changeSeries[i] })),
      hourly,
      composition: COMPONENTS.map(([key, label]) => ({ key, label, count: counts[key] ?? 0 })).filter((c) => c.count > 0),
      recent: recentRows.rows.map((r) => {
        const page = (() => { try { return getSetupPage(r.page_key); } catch { return null; } })();
        return { id: r.id, at: r.created_at, action: r.action, summary: r.summary, pageKey: r.page_key, pageName: page?.name ?? r.page_key,
          who: { id: r.user_id, name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || r.email || 'System', avatar: r.user_id ? avatarUrl(r.user_id, r.avatar_version ?? 0) : null } };
      }),
      attention: health.risks.slice(0, 5).map((r) => ({ label: r.label, pageKey: r.page, pageName: r.pageName, current: String(r.current), standard: String(r.standard), weight: r.weight })),
    };
  }
}
