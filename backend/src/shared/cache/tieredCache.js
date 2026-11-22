import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';

const VERSION_TTL_MS = 1000; // safety net if a pub/sub message is missed
const INVALIDATION_CHANNEL = 'cache:invalidate';
const etagOf = (body) => `"${createHash('md5').update(body).digest('base64url').slice(0, 16)}"`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Two-level cache shared by every API process.
 *  L1  per-process LRU (microseconds)        L2  Redis (shared, ~0.2ms)
 * Invalidation is by *namespace version*: a write bumps `v:<ns>` and publishes it, so every cached page of that
 * namespace becomes unreachable at once on all workers (the Odoo `orm_signaling` idea, on Redis). Without Redis it
 * degrades to a single-process cache (tests / dev).
 */
export class TieredCache {
  constructor({ redis = null, subscriber = null, logger, maxEntries = 20_000 }) {
    this.redis = redis;
    this.logger = logger;
    this.l1 = new LRUCache({ max: maxEntries });
    this.versions = new Map(); // ns -> { v, until }
    this.localVersions = new Map(); // memory-mode counters
    this.inflight = new Map();
    this.stats = { l1Hits: 0, l2Hits: 0, misses: 0, loads: 0, stale: 0 };
    if (subscriber) {
      subscriber.subscribe(INVALIDATION_CHANNEL).catch((e) => logger.error({ err: e }, 'cache subscribe failed'));
      subscriber.on('message', (channel, ns) => { if (channel === INVALIDATION_CHANNEL) this.versions.delete(ns); });
    }
  }

  async version(ns) {
    const hit = this.versions.get(ns);
    if (hit && hit.until > Date.now()) return hit.v;
    const v = this.redis ? Number((await this.redis.get(`v:${ns}`)) ?? 0) : this.localVersions.get(ns) ?? 0;
    this.versions.set(ns, { v, until: Date.now() + VERSION_TTL_MS });
    return v;
  }

  /** Invalidate everything cached under `ns` (all workers). */
  async bump(ns) {
    let v;
    if (this.redis) {
      v = await this.redis.incr(`v:${ns}`);
      this.redis.publish(INVALIDATION_CHANNEL, ns).catch(() => {});
    } else {
      v = (this.localVersions.get(ns) ?? 0) + 1;
      this.localVersions.set(ns, v);
    }
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
      const raw = await this.redis.get(key);
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
      if (this.redis) this.redis.set(key, `${etag}\n${body}`, 'PX', ttlMs + staleMs).catch(() => {});
      return entry;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  /** Cross-process lock for expensive refreshes (dashboards). Returns a release fn, or null if someone else holds it. */
  async tryLock(name, ttlMs) {
    if (!this.redis) return () => {};
    const token = Math.random().toString(36).slice(2);
    const ok = await this.redis.set(`lock:${name}`, token, 'PX', ttlMs, 'NX');
    return ok ? () => this.redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end", 1, `lock:${name}`, token).catch(() => {}) : null;
  }

  async waitFor(fn, { tries = 40, delayMs = 25 } = {}) {
    for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await sleep(delayMs); }
    return null;
  }

  snapshot() {
    return { ...this.stats, l1Entries: this.l1.size, mode: this.redis ? 'redis+memory' : 'memory' };
  }
}
