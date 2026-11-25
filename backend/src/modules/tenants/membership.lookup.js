const NS = (tenantId) => `mem:${tenantId}`;
const TTL = { ttlMs: 30_000 };

/** Cached membership check for hot admin routes. Only positive answers are trusted from cache; a miss always asks the DB. */
export class MembershipLookup {
  constructor({ repos, cache }) { Object.assign(this, { repos, cache }); }

  async find(tenantId, userId) {
    const cached = await this.cache.rememberValue(NS(tenantId), userId, TTL, async () => (await this.repos.memberships.find(tenantId, userId)) ?? null);
    return cached ?? this.repos.memberships.find(tenantId, userId);
  }

  /** Call after any role change or removal so access changes apply immediately on every worker. */
  invalidate(tenantId) { return Promise.all([this.cache.bump(NS(tenantId)), this.cache.bump(`search:${tenantId}`)]); } // roles and profiles change what people may find
}
