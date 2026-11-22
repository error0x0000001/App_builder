import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';

const VERSION_TTL_MS = 1000; // safety net if a pub/sub message is missed
const INVALIDATION_STREAM = 'cache:invalidations';
const STREAM_MAXLEN = 10_000;
const etagOf = (body) => `"${createHash('md5').update(body).digest('base64url').slice(0, 16)}"`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Two-level cache shared by every API process.
 *  L1  per-process LRU (microseconds)        L2  Redis (shared, ~0.2ms)
 * Invalidation is by *namespace version*: a write bumps `v:<ns>` and publishes it, so every cached page of that
 * namespace becomes unreachable at once on all workers (the Odoo registry-signalling idea, over a Redis Stream instead of a per-request DB read). Without Redis it
 * degrades to a single-process cache (tests / dev).
 */
export class TieredCache {
  constructor({ redis = null, subscriber = null, logger, maxEntries = 20_000 }) {
    this.redis = redis;
    this.logger = logger;
    this.l1 = new LRUCache({ max: maxEntries });
    this.versions = new Map(); // ns -> { v, until }
    this.localVersions = new Map(); // memory-mode counters
    this.windows = new Map(); // allow(): per-key rate windows
    this.inflight = new Map();
    this.stats = { l1Hits: 0, l2Hits: 0, misses: 0, loads: 0, stale: 0 };
    this.subscriber = subscriber;
    this.closed = false;
    if (subscriber) this.#tail().catch((e) => logger.error({ err: e }, 'cache invalidation reader stopped'));
  }

  /**
   * Reads the invalidation stream (Redis Streams, durable): each worker keeps the id of the last event it handled, so a
   * brief disconnect replays what it missed instead of losing it. If the reader errors, local versions are dropped and
   * re-read from Redis (the source of truth), so a stale entry can never outlive the 1s version TTL either way.
   */
  async #tail() {
    let last = '$';
    while (!this.closed) {
      try {
        const res = await this.subscriber.xread('BLOCK', 2000, 'COUNT', 200, 'STREAMS', INVALIDATION_STREAM, last);
        if (!res) continue;
        for (const [id, fields] of res[0][1]) { this.versions.delete(fields[1]); last = id; }
      } catch (error) {
        if (this.closed) return;
        this.logger.warn({ err: error.message }, 'cache invalidation reader error');
        this.versions.clear();
        await sleep(500);
      }
    }
  }

  stop() { this.closed = true; this.subscriber?.disconnect(); }

  /** Redis call that never throws: on failure (outage/timeout) returns `fallback` so callers degrade to memory/DB. */
  async #redis(fn, fallback = null) {
    try { return await fn(this.redis); } catch (error) {
      if (!this.redisDown) { this.redisDown = true; this.logger.warn({ err: error.message }, 'redis unavailable, serving from memory/database'); }
      return fallback;
    }
  }

  async version(ns) {
    const hit = this.versions.get(ns);
    if (hit && hit.until > Date.now()) return hit.v;
    const remote = this.redis ? await this.#redis((r) => r.get(`v:${ns}`), undefined) : undefined;
    const v = remote === undefined ? this.localVersions.get(ns) ?? 0 : Number(remote ?? 0);
    this.versions.set(ns, { v, until: Date.now() + VERSION_TTL_MS });
    return v;
  }

  /** Invalidate everything cached under `ns` (all workers). */
  async bump(ns) {
    const local = (this.localVersions.get(ns) ?? 0) + 1;
    this.localVersions.set(ns, local);
    const remote = this.redis
      ? await this.#redis(async (r) => (await r.multi().incr(`v:${ns}`).xadd(INVALIDATION_STREAM, 'MAXLEN', '~', STREAM_MAXLEN, '*', 'ns', ns).exec())[0][1])
      : null;
    const v = remote ?? local;
    this.versions.set(ns, { v, until: Date.now() + VERSION_TTL_MS });
    return v;
  }

  /**
   * Cached, pre-serialised JSON: { body, etag, value }.
   * `loader` returns a JS value; it runs once per (ns version, keyPart) across concurrent callers and workers.
   * With `staleMs`, an expired entry is served immediately while one refresh runs in the background.
   */
  async remember(ns, keyPart, { ttlMs = 30_000, staleMs = 0 } = {}, loader) {
    const key = `c:${ns}:${await this.version(ns)}:${keyPart}`;
    const now = Date.now();
    const l1 = this.l1.get(key);
    if (l1) {
      if (l1.fresh > now) { this.stats.l1Hits++; return l1; }
      if (l1.until > now) { this.stats.stale++; this.#load(key, ttlMs, staleMs, loader).catch(() => {}); return l1; }
    }
    if (this.redis) {
      const raw = await this.#redis((r) => r.get(key));
      if (raw !== null) {
        this.stats.l2Hits++;
        const entry = this.#entry(raw.slice(raw.indexOf('\n') + 1), raw.slice(0, raw.indexOf('\n')), ttlMs, staleMs);
        this.l1.set(key, entry);
        return entry;
      }
    }
    this.stats.misses++;
    return this.#load(key, ttlMs, staleMs, loader);
  }

  /** Like remember(), but returns the parsed value (memoised on the L1 entry). */
  async rememberValue(ns, keyPart, opts, loader) {
    const entry = await this.remember(ns, keyPart, opts, loader);
    return (entry.value ??= JSON.parse(entry.body));
  }

  #entry(body, etag, ttlMs, staleMs, value) {
    const now = Date.now();
    return { body, etag, value, fresh: now + Math.min(ttlMs, 5_000), until: now + ttlMs + staleMs }; // L1 re-checks Redis every <=5s
  }

  #load(key, ttlMs, staleMs, loader) {
    const running = this.inflight.get(key);
    if (running) return running;
    const task = (async () => {
      this.stats.loads++;
      const value = await loader();
      const body = JSON.stringify(value);
      const etag = etagOf(body);
      const entry = this.#entry(body, etag, ttlMs, staleMs, value);
      this.l1.set(key, entry);
      if (this.redis) this.#redis((r) => r.set(key, `${etag}\n${body}`, 'PX', ttlMs + staleMs));
      return entry;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  /** Cross-process lock for expensive refreshes (dashboards). Returns a release fn, or null if someone else holds it. */
  async tryLock(name, ttlMs) {
    if (!this.redis) return () => {};
    const token = Math.random().toString(36).slice(2);
    const ok = await this.#redis((r) => r.set(`lock:${name}`, token, 'PX', ttlMs, 'NX'), 'OK'); // Redis down => proceed unlocked
    return ok ? () => this.#redis((r) => r.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end", 1, `lock:${name}`, token)) : null;
  }

  async waitFor(fn, { tries = 40, delayMs = 25 } = {}) {
    for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await sleep(delayMs); }
    return null;
  }

  /** Fixed-window counter shared by all workers (Redis INCR); per-process when Redis is absent. */
  async hit(key, windowSeconds) {
    if (this.redis) {
      const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
      const count = await this.#redis((r) => r.incr(k));
      if (count !== null) {
        if (count === 1) this.#redis((r) => r.expire(k, windowSeconds + 1));
        return count;
      }
    }
    const k = `${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    this.localHits ??= new Map();
    if (this.localHits.size > 50_000) this.localHits.clear();
    const count = (this.localHits.get(k) ?? 0) + 1;
    this.localHits.set(k, count);
    return count;
  }

  /**
   * Hot-path rate check with no await: counts locally and syncs to Redis in the background (every 20 hits or 250ms),
   * so a request pays no Redis round trip. Other workers' counts lag by at most ~250ms — fine for a noisy-neighbour guard.
   */
  allow(key, windowSeconds, limit) {
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    let state = this.windows.get(key);
    if (state?.window !== window) {
      if (this.windows.size > 50_000) this.windows.clear();
      state = { window, global: 0, pending: 0, inflight: 0, lastSync: Date.now() };
      this.windows.set(key, state);
    }
    state.pending++;
    if (this.redis && !state.inflight && (state.pending >= 20 || Date.now() - state.lastSync > 250)) this.#sync(key, state, windowSeconds);
    return state.global + state.pending + state.inflight <= limit;
  }

  async #sync(key, state, windowSeconds) {
    const n = state.pending;
    state.pending = 0; state.inflight = n;
    const k = `rl:${key}:${state.window}`;
    const total = await this.#redis(async (r) => { const [[, v]] = await r.multi().incrby(k, n).expire(k, windowSeconds + 1).exec(); return v; });
    state.inflight = 0; state.lastSync = Date.now();
    if (total === null) state.pending += n; // Redis unavailable: keep counting locally
    else state.global = total;
  }

  snapshot() {
    return { ...this.stats, l1Entries: this.l1.size, mode: this.redis ? 'redis+memory' : 'memory' };
  }
}
