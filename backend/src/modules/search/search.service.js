import { FILE_KIND_LABELS } from '@app/shared';
import { sql } from 'drizzle-orm';
import { searchSetupIndex } from './staticIndex.js';

/** Cache namespace of an organisation's search results; bumped on every data, sharing, profile or membership change so permissions apply at once. */
export const searchNs = (ws) => `search:${ws}`;

const GROUP_BUDGET_MS = 250; // a slow group is dropped (and flagged partial) instead of holding up the others
const MIN_CHARS = 2;
const CONTAINS_MIN = 3; // trigram needs 3+ characters; shorter queries match by prefix only
const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

const timeLimited = (promise, ms) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ timedOut: true, items: [] }), ms);
  promise.then((items) => { clearTimeout(timer); resolve({ items }); }, () => { clearTimeout(timer); resolve({ failed: true, items: [] }); });
});

/** Which result groups each scope asks for. "Records" covers the people of the organisation too. */
const SCOPES = { all: ['records', 'people', 'navigation', 'documents'], records: ['records', 'people'], people: ['people'], navigation: ['navigation'], documents: ['documents'] };

/**
 * One query box for everything the person may see: records, people, and — for admins — Setup pages, settings and configuration (navigation), plus Documents.
 * Records come from registered sources (`recordSources`: objects with real tables plug in here, each one filtering by what the person may read); none exist yet,
 * so that group is empty for now. Each group is looked up in parallel; prefix matches come first, then substring matches, both capped.
 */
export class SearchService {
  constructor({ db, cache, drive, recordSources = [] }) { Object.assign(this, { db, cache, drive, recordSources }); }

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
      documents: wants('documents') && this.#documents(ctx, query, limit),
    };
    const entries = await Promise.all(Object.entries(tasks).filter(([, p]) => p).map(async ([key, p]) => [key, await timeLimited(p, GROUP_BUDGET_MS)]));
    return {
      q: query,
      groups: Object.fromEntries(entries.map(([key, r]) => [key, r.items])),
      partial: entries.some(([, r]) => r.timedOut || r.failed),
      tookMs: Date.now() - started,
    };
  }

  async #records(ctx, query, limit) {
    const found = await Promise.all(this.recordSources.map((source) => source.search(ctx, query, limit)));
    return found.flat().slice(0, limit);
  }

  async #people(ctx, query, limit) {
    const { rows } = await this.db.execute(sql`
      select u.id, u.first_name, u.last_name, u.email, m.role from memberships m join users u on u.id = m.user_id
      where m.tenant_id = ${ctx.tenantId} and lower(u.first_name || ' ' || u.last_name || ' ' || u.email) like ${`%${escapeLike(query.toLowerCase())}%`}
      limit ${limit}`);
    return rows.map((r) => ({ id: r.id, kind: 'person', title: `${r.first_name} ${r.last_name}`, subtitle: r.email, tag: r.role, to: '/app/members' }));
  }

  /** Setup pages and individual settings (the registry), plus the organisation's real configuration: profiles, permission sets and roles. */
  async #navigation(ctx, query, limit) {
    const staticHits = searchSetupIndex(query, limit).map((hit) => ({ ...hit, tag: hit.kind === 'page' ? 'Setup page' : 'Setting' }));
    const pattern = `%${escapeLike(query.toLowerCase())}%`;
    const { rows } = await this.db.execute(sql`
      select * from (
        select id, name, 'profiles' as page, 'Profile' as kind from profiles where tenant_id = ${ctx.tenantId} and lower(name) like ${pattern}
        union all select id, name, 'object-settings', 'Permission set' from permission_sets where tenant_id = ${ctx.tenantId} and lower(name) like ${pattern}
        union all select id, name, 'roles', 'Role' from hierarchy_roles where tenant_id = ${ctx.tenantId} and lower(name) like ${pattern}
      ) c limit ${limit}`);
    const config = rows.map((r) => ({ id: r.id, kind: 'config', title: r.name, subtitle: r.kind, tag: 'Configuration', to: `/app/setup/${r.page}?q=${encodeURIComponent(r.name)}` }));
    return [...staticHits, ...config].slice(0, limit * 2);
  }

  /** Files and folders of the Documents drive (only those this person may see). */
  async #documents(ctx, query, limit) {
    const { files, folders } = await this.drive.search(ctx, query, limit);
    return [
      ...folders.map((f) => ({ id: f.id, kind: 'folder', title: f.name, subtitle: '', tag: 'Folder', to: `/app/documents?folder=${f.id}` })),
      ...files.map((f) => ({ id: f.id, kind: 'file', title: f.name, subtitle: f.folderName ?? '', tag: FILE_KIND_LABELS[f.kind], to: `/app/documents?folder=${f.folderId}&file=${f.id}` })),
    ].slice(0, limit * 2);
  }
}
