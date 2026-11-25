import { INTERNAL_COLLECTIONS, SETUP_PAGES } from '@app/shared/setup-registry';
import { FILE_KIND_LABELS, getAdapterMeta } from '@app/shared';
import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';
import { searchSetupIndex } from './staticIndex.js';

/** Cache namespace of a tenant's search results; bumped on every data, rule, sharing, profile or membership change so permissions apply at once. */
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

/** Setup list pages whose records are documents (templates, letterheads, files) — searched as "Documents", not as configuration. */
const DOCUMENT_COLLECTIONS = ['email-templates', 'letterheads', 'mail-merge-templates', 'asset-files', 'post-templates', 'action-link-templates'];

/** Which result groups each scope asks for. "Records" covers the people of the tenant too. */
const SCOPES = { all: ['records', 'people', 'navigation', 'documents'], records: ['records', 'people'], people: ['people'], navigation: ['navigation'], documents: ['documents'] };

/**
 * One query box for everything the person may see: records of every object (permissions + sharing respected), people,
 * and — for admins — Setup pages, individual settings and Setup records (navigation), and document-like Setup records (documents).
 * Each group is looked up in parallel; prefix matches (btree) come first, then substring matches (trigram), both capped.
 */
export class SearchService {
  constructor({ db, objects, cache, drive }) { Object.assign(this, { db, objects, cache, drive }); }

  search(ctx, { q, type = 'all' }) {
    const query = q.trim();
    if (query.length < MIN_CHARS) return Promise.resolve({ body: JSON.stringify({ q: query, groups: {}, partial: false }), etag: '"empty"' });
    return this.cache.remember(searchNs(ctx.tenantId), `${ctx.userId}|${type}|${query.toLowerCase()}`, { ttlMs: 8_000 }, () => this.#run(ctx, query, type));
  }

  async #run(ctx, query, type) {
    const started = Date.now();
    const admin = ctx.actor.role === 'owner' || ctx.actor.role === 'admin';
    const limit = type === 'all' ? 5 : 20;
    const wants = (group) => SCOPES[type].includes(group);
    const tasks = {
      records: wants('records') && this.#records(ctx, query, limit),
      people: wants('people') && query.length >= CONTAINS_MIN && this.#people(ctx, query, limit),
      navigation: wants('navigation') && admin && this.#navigation(ctx, query, limit),
      documents: wants('documents') && this.#documents(ctx, query, limit, admin),
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
      where tenant_id = ${ctx.tenantId} and (${scope}) and collection not in (${NOISY}) and lower(label) ${op} ${pattern}
      limit ${n}`).then((r) => r.rows);
    const rows = await this.#twoPhase((p, n) => find(p, sql`like`, n), (p, n) => find(p, sql`like`, n), query, limit);
    return rows.map((r) => ({ id: r.id, kind: 'record', title: r.label, subtitle: r.status ?? '', tag: plural.get(r.collection), to: `/app/o/${r.collection.slice(4)}?open=${r.id}` }));
  }

  async #people(ctx, query, limit) {
    const { rows } = await this.db.execute(sql`
      select u.id, u.first_name, u.last_name, u.email, m.role from memberships m join users u on u.id = m.user_id
      where m.tenant_id = ${ctx.tenantId} and lower(u.first_name || ' ' || u.last_name || ' ' || u.email) like ${`%${escapeLike(query.toLowerCase())}%`}
      limit ${limit}`);
    return rows.map((r) => ({ id: r.id, kind: 'person', title: `${r.first_name} ${r.last_name}`, subtitle: r.email, tag: r.role, to: '/app/members' }));
  }

  async #setupRecords(ctx, query, limit, keys) {
    const find = (pattern, n) => this.db.execute(sql`
      select id, label, status, collection from setup_records
      where tenant_id = ${ctx.tenantId} and collection = any(${pgArray(keys, 'text')}) and collection not in (${NOISY}) and lower(label) like ${pattern}
      limit ${n}`).then((r) => r.rows);
    return this.#twoPhase(find, find, query, limit);
  }

  /** Setup pages, individual settings and configuration records (rules, profiles …). */
  async #navigation(ctx, query, limit) {
    const staticHits = searchSetupIndex(query, limit).map((hit) => ({ ...hit, tag: hit.kind === 'page' ? 'Setup page' : 'Setting' }));
    const keys = Object.keys(SETUP_COLLECTIONS).filter((key) => !DOCUMENT_COLLECTIONS.includes(key));
    const rows = await this.#setupRecords(ctx, query, limit, keys);
    const records = rows.map((r) => ({ id: r.id, kind: 'config', title: r.label, subtitle: SETUP_COLLECTIONS[r.collection], tag: 'Configuration', to: `/app/setup/${r.collection}?q=${encodeURIComponent(r.label)}` }));
    return [...staticHits, ...records].slice(0, type_limit(limit));
  }

  /** Files and folders of the Documents drive (only those this person may see), plus — for admins — document-like Setup records (templates, letterheads …). */
  async #documents(ctx, query, limit, admin) {
    const { files, folders } = await this.drive.search(ctx, query, limit);
    const drive = [
      ...folders.map((f) => ({ id: f.id, kind: 'folder', title: f.name, subtitle: '', tag: 'Folder', to: `/app/documents?folder=${f.id}` })),
      ...files.map((f) => ({ id: f.id, kind: 'file', title: f.name, subtitle: f.folderName ?? '', tag: FILE_KIND_LABELS[f.kind], to: `/app/documents?folder=${f.folderId}&file=${f.id}` })),
    ];
    if (!admin) return drive.slice(0, limit);
    const rows = await this.#setupRecords(ctx, query, limit, DOCUMENT_COLLECTIONS);
    const templates = rows.map((r) => ({ id: r.id, kind: 'document', title: r.label, subtitle: r.status ?? '', tag: SETUP_COLLECTIONS[r.collection], to: `/app/setup/${r.collection}?q=${encodeURIComponent(r.label)}` }));
    return [...drive, ...templates].slice(0, limit * 2);
  }
}

const type_limit = (limit) => limit * 2;
