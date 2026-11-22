import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { TieredCache } from './tieredCache.js';

/** Builds the shared cache. REDIS_URL unset => in-process only (fine for dev/tests; production runs Redis). */
export function createCache() {
  if (!config.REDIS_URL) return new TieredCache({ logger });
  // Commands wait briefly for the connection and then fail fast; TieredCache treats a failure as "Redis unavailable" and
// serves from memory/DB, so a Redis outage degrades latency instead of causing errors.
const opts = { maxRetriesPerRequest: 1, commandTimeout: 300, enableOfflineQueue: true, retryStrategy: (n) => Math.min(n * 200, 2000) };
  const redis = new Redis(config.REDIS_URL, opts);
  const subscriber = new Redis(config.REDIS_URL, { ...opts, commandTimeout: undefined, maxRetriesPerRequest: null });
  for (const client of [redis, subscriber]) client.on('error', (e) => logger.warn({ err: e.message }, 'redis error'));
  const cache = new TieredCache({ redis, subscriber, logger });
  cache.close = async () => { cache.stop(); await Promise.allSettled([redis.quit()]); };
  return cache;
}
