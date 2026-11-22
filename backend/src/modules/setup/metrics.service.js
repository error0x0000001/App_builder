import { ROLE_LABELS, ROLES } from '@app/shared';
import { sql } from 'drizzle-orm';
import { uuidV7Floor } from '../../shared/ids.js';

const DAY_MS = 86_400_000;
const NS = (ws) => `m:${ws}`;
const DASH_TTL = { ttlMs: 60_000, staleMs: 5 * 60_000 };
const LOGIN_TYPES = sql`('login_success')`;
const n = (v) => Number(v).toLocaleString('en-US');
const bytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const pct = (part, whole) => (whole ? Math.min(100, Math.round((part / whole) * 100)) : 0);
const notEnabled = (title, note) => ({ cards: [{ k: title, v: 'Not enabled', s: note }], bars: [], table: null });

/** Dashboards: every number is computed from live data, cached ~60s per workspace (stale-while-revalidate, single-flight). */
export class MetricsService {
  constructor({ repos, db, cache, usage, health }) {
    Object.assign(this, { repos, db, cache, usage, health });
    this.providers = {
      'adoption-manager': (ws) => this.#adoption(ws),
      'storage-usage': (ws) => this.#storage(ws),
      'platform-cache': () => this.#platformCache(),
      optimizer: (ws) => this.#optimizer(ws),
      'readiness-assessor': () => notEnabled('Einstein readiness', 'Scoring models are not enabled for this workspace'),
      'data-integration-metrics': (ws) => this.#integration(ws),
      'data-com-licenses-and-limits': () => notEnabled('Data.com', 'This add-on is not part of Cloudbase'),
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
        select user_id from auth_events where workspace_id = ${ws} and id >= ${uuidV7Floor(Date.now() - sinceMs)}::uuid and type in ${LOGIN_TYPES} limit 100000) e`);
    return rows[0].n;
  }

  async #adoption(ws) {
    const [members, active7, active30, logins30, roleRows] = await Promise.all([
      this.repos.memberships.countMembers(ws), this.#countEvents(ws, 7 * DAY_MS, true), this.#countEvents(ws, 30 * DAY_MS, true), this.#countEvents(ws, 30 * DAY_MS),
      this.db.execute(sql`select role, count(*)::int as n from memberships where workspace_id = ${ws} group by role`),
    ]);
    const score = pct(active7, members);
    const byRole = Object.fromEntries(roleRows.rows.map((r) => [r.role, r.n]));
    return {
      cards: [
        { k: 'Active users (7 days)', v: n(active7), s: `of ${n(members)} members` },
        { k: 'Logins last 30 days', v: n(logins30), s: logins30 >= 100000 ? 'counted up to 100,000' : `${n(active30)} distinct users` },
        { k: 'Inactive members (30 days)', v: n(Math.max(0, members - active30)), s: 'No sign-in in 30 days' },
        { k: 'Adoption score', v: String(score), s: score >= 75 ? 'Excellent' : score >= 40 ? 'Good' : 'Needs attention' },
      ],
      bars: ROLES.filter((r) => byRole[r]).map((r) => [ROLE_LABELS[r], pct(byRole[r], members)]),
      table: null,
    };
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

  /** Process-level cache statistics (this node), not workspace data. */
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
    const [health, changes] = await Promise.all([this.health.evaluate(ws), this.db.execute(sql`select count(*)::int as n from (select 1 from setup_audit where workspace_id = ${ws} and id >= ${uuidV7Floor(Date.now() - 30 * DAY_MS)}::uuid limit 10000) a`)]);
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

  async #overview(ws) {
    const [counts, storage, api] = await Promise.all([
      this.repos.setupRecords.countsByCollection(ws, ['object-manager-objects', 'object-manager-fields', 'workflow-rules', 'flows', 'apex-triggers', 'validation-rules', 'profiles', 'permission-sets', 'roles']),
      this.repos.setupRecords.storageByCollection(ws), this.usage.last24h(ws),
    ]);
    const stored = storage.reduce((s, r) => s + r.bytes, 0);
    const custom = await this.db.execute(sql`select count(*)::int as n from setup_records where workspace_id = ${ws} and collection = 'object-manager-objects' and status = 'Custom'`);
    const gauge = (label, used, limit, fmt = n) => ({ label, used, limit, pct: pct(used, limit), text: `${fmt(used)} of ${fmt(limit)}` });
    return { gauges: [
      gauge('Custom objects', custom.rows[0].n, 2000), gauge('Custom fields', counts['object-manager-fields'] ?? 0, 100_000),
      gauge('Data storage', stored, 5e9, bytes), gauge('API requests (24h)', api, 1_000_000),
      gauge('Flows', counts.flows ?? 0, 2000), gauge('Workflow rules', counts['workflow-rules'] ?? 0, 500),
      gauge('Profiles', counts.profiles ?? 0, 1000), gauge('Permission sets', counts['permission-sets'] ?? 0, 1500),
    ] };
  }
}
