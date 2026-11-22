import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCache } from '../src/shared/cache/redis.js';
import { TieredCache } from '../src/shared/cache/tieredCache.js';

const a = createCache(); const b = createCache();
after(async () => { await a.close?.(); await b.close?.(); });
const ns = () => `t:${Math.random().toString(36).slice(2)}`;

describe('tiered cache', () => {
  it('collapses concurrent misses into one load (single-flight)', async () => {
    const n = ns(); let loads = 0;
    const load = async () => { loads++; await sleep(20); return { v: 1 }; };
    await Promise.all(Array.from({ length: 50 }, () => a.remember(n, 'k', { ttlMs: 5000 }, load)));
    assert.equal(loads, 1);
  });
  it('serves a pre-serialised body with a stable ETag', async () => {
    const n = ns();
    const e1 = await a.remember(n, 'k', {}, async () => ({ x: 1 }));
    const e2 = await a.remember(n, 'k', {}, async () => ({ x: 2 }));
    assert.equal(e1.body, '{"x":1}');
    assert.equal(e1.etag, e2.etag);
  });
  it('a bump on one worker invalidates the other worker (Redis stream)', { skip: !a.redis }, async () => {
    const n = ns();
    assert.equal((await a.rememberValue(n, 'k', { ttlMs: 60_000 }, async () => 'old')), 'old');
    assert.equal((await b.rememberValue(n, 'k', { ttlMs: 60_000 }, async () => 'old')), 'old');
    await b.bump(n);
    await sleep(50);
    assert.equal(await a.rememberValue(n, 'k', { ttlMs: 60_000 }, async () => 'new'), 'new');
  });
  it('an entry read back from Redis exposes its parsed value like a fresh one', { skip: !a.redis }, async () => {
    const n = ns();
    await a.remember(n, 'k', { ttlMs: 60_000 }, async () => ({ answer: 42 }));
    const fromRedis = await b.remember(n, 'k', { ttlMs: 60_000 }, async () => ({ answer: 0 })); // b has no L1 entry: served from Redis
    assert.equal(fromRedis.value.answer, 42);
  });
  it('serves stale data while one background refresh runs', async () => {
    const n = ns(); let loads = 0;
    const load = async () => ({ n: ++loads });
    await a.remember(n, 'k', { ttlMs: 20, staleMs: 5000 }, load);
    await sleep(30);
    const stale = await a.remember(n, 'k', { ttlMs: 20, staleMs: 5000 }, load);
    assert.equal(stale.value.n, 1, 'returned immediately from the stale entry');
    await sleep(30);
    assert.equal(loads, 2, 'and refreshed once in the background');
  });
  it('counts hits per window shared across workers', { skip: !a.redis }, async () => {
    const key = ns();
    await a.hit(key, 60); await b.hit(key, 60);
    assert.equal(await a.hit(key, 60), 3);
  });
  it('rate checks cost no Redis round trip and still enforce the limit', () => {
    const key = ns();
    const results = Array.from({ length: 10 }, () => a.allow(key, 60, 5));
    assert.deepEqual(results, [true, true, true, true, true, false, false, false, false, false]);
  });
  it('degrades to memory when Redis is unavailable instead of failing requests', async () => {
    const broken = new Proxy({}, { get: () => () => { throw new Error('ECONNREFUSED'); } });
    const cache = new TieredCache({ redis: broken, logger: { warn() {}, error() {} } });
    const e = await cache.remember('x', 'k', {}, async () => ({ ok: true }));
    assert.equal(e.body, '{"ok":true}');
    assert.equal(typeof (await cache.bump('x')), 'number');
    assert.equal(await cache.hit('rl', 60), 1);
  });
});
