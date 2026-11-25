import { SETUP_LIST, getAdapterMeta, recordSchemas } from '@app/shared';
import { createHash } from 'node:crypto';
import { ForbiddenError } from '../../shared/errors.js';
import { staticPage } from './staticLists.js';

/** Cache namespace of one Setup list in one tenant; bump it to refresh every cached page of that list. */
export const listNs = (tenantId, key) => `r:${tenantId}:${key}`;
const LIST_TTL_MS = 30_000;
const STATIC_NS = (key) => `static:${key}`;

/**
 * The Setup lists. A list is either backed by a real table (an adapter in adapters.js / accessLists.js) or is a read-only preview served from
 * fixtures until its table exists. There is no generic record store: a page that can change data always has an adapter that owns its table.
 */
export class RecordsService {
  constructor({ cache, adapters }) { Object.assign(this, { cache, adapters }); }

  list(ctx, collection, params) {
    const limit = Math.min(params.limit ?? SETUP_LIST.defaultLimit, SETUP_LIST.maxLimit);
    const adapter = this.adapters[collection.key];
    if (!adapter) return this.cache.remember(STATIC_NS(collection.key), this.#hash(params, limit), { ttlMs: 10 * 60_000 }, async () => staticPage(collection, { ...params, limit }));
    // Adapter data can change outside this service (sessions, logins), so it gets a short TTL; changes made here bump the namespace.
    return this.cache.remember(listNs(ctx.tenantId, collection.key), this.#hash(params, limit), { ttlMs: adapter.volatile ? 5_000 : LIST_TTL_MS }, () => adapter.list(ctx, { ...params, limit }));
  }

  /** Pages declare what they allow; anything else is refused up front instead of failing inside the adapter. */
  #adapter(collection, capability) {
    const adapter = this.adapters[collection.key];
    if (!adapter || !getAdapterMeta(collection.key)?.[capability]) throw new ForbiddenError(adapter ? 'This page does not allow that action' : 'This page is a preview: it shows sample content and cannot be changed yet');
    return adapter;
  }

  /** The body is validated with the page's shared schema (the same one the dialog uses) before the adapter sees it. `parentId` is a hierarchy link, not a field. */
  create(ctx, collection, input) {
    const adapter = this.#adapter(collection, 'canCreate');
    const { parentId, ...fields } = input ?? {};
    return adapter.create(ctx, { ...recordSchemas(collection).create.parse(fields), ...(parentId ? { parentId } : {}) });
  }
  update(ctx, collection, id, input) {
    const adapter = this.#adapter(collection, 'canEdit');
    const { parentId, ...fields } = input ?? {};
    const hasFields = Object.keys(fields).length > 0;
    return adapter.update(ctx, id, { ...(hasFields || !parentId ? recordSchemas(collection).update.parse(fields) : {}), ...(parentId ? { parentId } : {}) });
  }
  async remove(ctx, collection, ids) {
    if (ids.length > SETUP_LIST.bulkMax) throw new ForbiddenError(`At most ${SETUP_LIST.bulkMax} records at a time`);
    return this.#adapter(collection, 'canDelete').remove(ctx, ids);
  }

  /** Nested tree for hierarchy pages (the role hierarchy). */
  tree(ctx, collection) {
    const adapter = this.adapters[collection.key];
    return this.cache.remember(listNs(ctx.tenantId, collection.key), 'tree', { ttlMs: LIST_TTL_MS }, () => (adapter?.tree ? adapter.tree(ctx) : { roots: [] }));
  }

  #hash(params, limit) {
    return createHash('md5').update(JSON.stringify([params.after, params.q, params.view, params.sort, params.dir, params.status, params.parent, params.total ? 1 : 0, limit])).digest('base64url').slice(0, 14);
  }
}
