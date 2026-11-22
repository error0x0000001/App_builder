import { INTERNAL_COLLECTIONS, SETUP_PAGES } from '@app/shared/setup-registry';
import { getAdapterMeta } from '@app/shared';
import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';
import { searchSetupIndex } from './staticIndex.js';

/** Cache namespace of a workspace's search results; bumped on every data, rule, sharing, profile or membership change so permissions apply at once. */
export const searchNs = (ws) => `search:${ws}`;

const GROUP_BUDGET_MS = 250; // a slow group is dropped (and flagged partial) instead of holding up the others
const MIN_CHARS = 2;
const CONTAINS_MIN = 3; // trigram needs 3+ characters; shorter queries match by prefix only
/** Must match the partial indexes in migration 0007: the same literal predicate lets the planner use them. */
const NOISY = sql`'debug-log-entries', 'email-log', 'tool-runs', 'duplicate-error-logs', 'case-escalations'`;
const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

const timeLimited = (promise, ms) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ timedOut: true, items: [] }), ms);
  promise.then((items) => { clearTimeout(timer); resolve({ items }); }, () => { clearTimeout(timer); resolve({ failed: true, items: [] }); });
});

/** Setup list pages worth searching (not log-like, not adapters over real tables). */
const SETUP_COLLECTIONS = Object.fromEntries(
  [...Object.values(SETUP_PAGES).filter((p) => (p.kind === 'list' || p.kind === 'tree') && !getAdapterMeta(p.key)).map((p) => [p.key, p.name]),
    ...Object.values(INTERNAL_COLLECTIONS).filter((c) => c.key !== 'debug-log-entries').map((c) => [c.key, c.name])]
    .filter(([key]) => !['duplicate-error-logs', 'case-escalations'].includes(key)),
);

/**
 * One query box for everything the person may see: records of every object (permissions + sharing respected), people,
 * and — for admins — Setup pages, individual settings and Setup records (rules, profiles, …).
 * Each group is looked up in parallel; prefix matches (btree) come first, then substring matches (trigram), both capped.
 */
export class SearchService {
  constructor({ db, objects, cache }) { Object.assign(this, { db, objects, cache }); }

  search(ctx, { q, type = 'all' }) {
    const query = q.trim();
    if (query.length < MIN_CHARS) return Promise.resolve({ body: JSON.stringify({ q: query, groups: {}, partial: false }), etag: '"empty"' });
    return this.cache.remember(searchNs(ctx.workspaceId), `${ctx.userId}|${type}|${query.toLowerCase()}`, { ttlMs: 8_000 }, () => this.#run(ctx, query, type));
  }

  async #run(ctx, query, type) {
    const started = Date.now();
    const admin = ctx.actor.role === 'owner' || ctx.actor.role === 'admin';
    const limit = type === 'all' ? 5 : 20;
    const wants = (t) => type === 'all' || type === t;
    const tasks = {
      records: wants('records') && this.#records(ctx, query, limit),
      people: wants('people') && query.length >= CONTAINS_MIN && this.#people(ctx, query, limit),
      setup: wants('setup') && admin && this.#setup(ctx, query, limit),
    };
    const entries = await Promise.all(Object.entries(tasks).filter(([, p]) => p).map(async ([key, p]) => [key, await timeLimited(p, GROUP_BUDGET_MS)]));
    return {
      q: query,
      groups: Object.fromEntries(entries.map(([key, r]) => [key, r.items])),
      partial: entries.some(([, r]) => r.timedOut || r.failed),
      tookMs: Date.now() - started,
    };
  }

  /** Two-phase: prefix matches first (index range scan), then substring matches to fill the page. */
  async #twoPhase(prefixQuery, containsQuery, query, limit) {
    const lowered = escapeLike(query.toLowerCase());
    const prefix = await prefixQuery(`${lowered}%`, limit);
    if (prefix.length >= limit || query.length < CONTAINS_MIN) return prefix;
    const seen = new Set(prefix.map((r) => r.id));
    const contains = await containsQuery(`%${lowered}%`, limit + prefix.length);
    return [...prefix, ...contains.filter((r) => !seen.has(r.id))].slice(0, limit);
  }

  async #records(ctx, query, limit) {
    const { all, own, plural } = await this.objects.readScopes(ctx);
    if (!all.length && !own.length) return [];
    const scope = sql.join([
      ...(all.length ? [sql`collection = any(${pgArray(all, 'text')})`] : []),
      ...own.map((o) => sql`(collection = ${o.collection} and data @> ${JSON.stringify({ [o.ownerKey]: ctx.email })}::jsonb)`),
    ], sql` or `);
    const find = (pattern, op, n) => this.db.execute(sql`
      select id, label, status, collection from setup_records
      where workspace_id = ${ctx.workspaceId} and (${scope}) and collection not in (${NOISY}) and lower(label) ${op} ${pattern}
      limit ${n}`).then((r) => r.rows);
    const rows = await this.#twoPhase((p, n) => find(p, sql`like`, n), (p, n) => find(p, sql`like`, n), query, limit);
    return rows.map((r) => ({ id: r.id, kind: 'record', title: r.label, subtitle: r.status ?? '', tag: plural.get(r.collection), to: `/app/o/${r.collection.slice(4)}?open=${r.id}` }));
  }

  async #people(ctx, query, limit) {
    const { rows } = await this.db.execute(sql`
      select u.id, u.first_name, u.last_name, u.email, m.role from memberships m join users u on u.id = m.user_id
      where m.workspace_id = ${ctx.workspaceId} and lower(u.first_name || ' ' || u.last_name || ' ' || u.email) like ${`%${escapeLike(query.toLowerCase())}%`}
      limit ${limit}`);
    return rows.map((r) => ({ id: r.id, kind: 'person', title: `${r.first_name} ${r.last_name}`, subtitle: r.email, tag: r.role, to: '/app/members' }));
  }

  async #setup(ctx, query, limit) {
    const staticHits = searchSetupIndex(query, limit);
    const keys = Object.keys(SETUP_COLLECTIONS);
    const find = (pattern, n) => this.db.execute(sql`
      select id, label, status, collection from setup_records
      where workspace_id = ${ctx.workspaceId} and collection = any(${pgArray(keys, 'text')}) and collection not in (${NOISY}) and lower(label) like ${pattern}
      limit ${n}`).then((r) => r.rows);
    const rows = await this.#twoPhase(find, find, query, limit);
    const records = rows.map((r) => ({ id: r.id, kind: 'config', title: r.label, subtitle: SETUP_COLLECTIONS[r.collection], to: `/app/setup/${r.collection}?q=${encodeURIComponent(r.label)}` }));
    return [...staticHits, ...records].slice(0, type_limit(limit));
  }
}

const type_limit = (limit) => limit * 2;
