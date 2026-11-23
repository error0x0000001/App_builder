const TTL_SECONDS = 70;

/**
 * Who is online. Ephemeral by design (never in Postgres): a key per person with a TTL that every socket heartbeat refreshes.
 * Redis when available (shared by all nodes); otherwise this process's memory. Clients ask for the people on screen rather than being
 * pushed every change, so a connect storm costs one key write per socket instead of a fan-out to every conversation.
 */
export class PresenceStore {
  constructor({ redis } = {}) {
    this.redis = redis ?? null;
    this.local = new Map();
  }

  #key = (workspaceId, userId) => `chat:p:${workspaceId}:${userId}`;

  async touch(workspaceId, userId) {
    const key = this.#key(workspaceId, userId);
    if (this.redis) { try { await this.redis.set(key, '1', 'EX', TTL_SECONDS); return; } catch { /* fall through to memory */ } }
    this.local.set(key, Date.now() + TTL_SECONDS * 1000);
  }

  async online(workspaceId, userIds) {
    const keys = userIds.map((id) => this.#key(workspaceId, id));
    if (this.redis) {
      try { const values = await this.redis.mget(keys); return userIds.filter((_, i) => values[i]); } catch { /* fall through */ }
    }
    const now = Date.now();
    return userIds.filter((_, i) => (this.local.get(keys[i]) ?? 0) > now);
  }
}
