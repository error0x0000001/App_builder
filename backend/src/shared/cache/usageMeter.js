const HOUR_MS = 3_600_000;
const hourKey = (t = Date.now()) => Math.floor(t / HOUR_MS);

/**
 * Counts API calls per workspace without a Redis round-trip per request: increments an in-memory map and flushes
 * batched HINCRBYs every few seconds. Powers "API Usage (24h)" in System Overview.
 */
export class UsageMeter {
  constructor({ redis = null, intervalMs = 5000 }) {
    this.redis = redis;
    this.pending = new Map();
    this.local = new Map(); // memory mode: hour -> Map(ws -> n)
    this.timer = setInterval(() => this.flush().catch(() => {}), intervalMs);
    this.timer.unref();
  }

  hit(workspaceId) { this.pending.set(workspaceId, (this.pending.get(workspaceId) ?? 0) + 1); }

  async flush() {
    if (!this.pending.size) return;
    const batch = this.pending; this.pending = new Map();
    const hour = hourKey();
    if (this.redis) {
      const pipe = this.redis.pipeline();
      for (const [ws, n] of batch) pipe.hincrby(`usage:${hour}`, ws, n);
      pipe.expire(`usage:${hour}`, 26 * 3600);
      await pipe.exec();
    } else {
      const bucket = this.local.get(hour) ?? new Map();
      for (const [ws, n] of batch) bucket.set(ws, (bucket.get(ws) ?? 0) + n);
      this.local.set(hour, bucket);
    }
  }

  /** Calls in the last 24 hours for a workspace. */
  async last24h(workspaceId) {
    await this.flush();
    const now = hourKey(); let total = 0;
    for (let h = now - 23; h <= now; h++) {
      total += this.redis ? Number((await this.redis.hget(`usage:${h}`, workspaceId)) ?? 0) : this.local.get(h)?.get(workspaceId) ?? 0;
    }
    return total;
  }

  stop() { clearInterval(this.timer); }
}
