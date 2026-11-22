const NS = (workspaceId) => `mem:${workspaceId}`;
const TTL = { ttlMs: 30_000 };

/** Cached membership check for hot admin routes. Only positive answers are trusted from cache; a miss always asks the DB. */
export class MembershipLookup {
  constructor({ repos, cache }) { Object.assign(this, { repos, cache }); }

  async find(workspaceId, userId) {
    const cached = await this.cache.rememberValue(NS(workspaceId), userId, TTL, async () => (await this.repos.memberships.find(workspaceId, userId)) ?? null);
    return cached ?? this.repos.memberships.find(workspaceId, userId);
  }

  /** Call after any role change or removal so access changes apply immediately on every worker. */
  invalidate(workspaceId) { return Promise.all([this.cache.bump(NS(workspaceId)), this.cache.bump(`search:${workspaceId}`)]); } // roles and profiles change what people may find
}
