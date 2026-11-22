import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { TieredCache } from './tieredCache.js';

/** Builds the shared cache. REDIS_URL unset => in-process only (fine for dev/tests; production runs Redis). */
export function createCache() {
  if (!config.REDIS_URL) return new TieredCache({ logger });
  const opts = { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false };
  const redis = new Redis(config.REDIS_URL, opts);
  const subscriber = new Redis(config.REDIS_URL, { ...opts, enableOfflineQueue: true });
  for (const client of [redis, subscriber]) client.on('error', (e) => logger.warn({ err: e.message }, 'redis error'));
  const cache = new TieredCache({ redis, subscriber, logger });
  cache.close = async () => { await Promise.allSettled([redis.quit(), subscriber.quit()]); };
  return cache;
}
