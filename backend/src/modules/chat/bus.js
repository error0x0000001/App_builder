import { EventEmitter } from 'node:events';
import Redis from 'ioredis';
import { logger } from '../../shared/logger.js';

/**
 * Fan-out between API/realtime nodes. `publish(channel, event)` reaches every node that called `subscribe(channel, fn)`.
 * Redis pub/sub when REDIS_URL is set (a node only subscribes to the conversations its connected people are in); an in-process emitter
 * otherwise (dev and tests with a single node). Subscriptions are reference counted so many sockets on one node cost one Redis subscription.
 */
export function createBus(redisUrl) {
  const local = new EventEmitter().setMaxListeners(0);
  if (!redisUrl) {
    return {
      publish: async (channel, event) => { local.emit(channel, event); },
      subscribe: (channel, fn) => { local.on(channel, fn); return () => local.off(channel, fn); },
      close: async () => local.removeAllListeners(),
    };
  }
  const pub = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: true });
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: null });
  for (const client of [pub, sub]) client.on('error', (e) => logger.warn({ err: e.message }, 'chat bus redis error'));
  const counts = new Map();
  sub.on('message', (channel, raw) => {
    try { local.emit(channel, JSON.parse(raw)); } catch { /* ignore malformed */ }
  });
  return {
    publish: async (channel, event) => { await pub.publish(channel, JSON.stringify(event)).catch((e) => logger.warn({ err: e.message }, 'chat publish failed')); local.emit('__sent', channel); },
    subscribe(channel, fn) {
      local.on(channel, fn);
      const n = (counts.get(channel) ?? 0) + 1; counts.set(channel, n);
      if (n === 1) sub.subscribe(channel).catch(() => {});
      return () => {
        local.off(channel, fn);
        const left = (counts.get(channel) ?? 1) - 1;
        if (left <= 0) { counts.delete(channel); sub.unsubscribe(channel).catch(() => {}); } else counts.set(channel, left);
      };
    },
    close: async () => { local.removeAllListeners(); await Promise.allSettled([pub.quit(), sub.quit()]); },
  };
}

export const conversationChannel = (id) => `chat:c:${id}`;
export const userChannel = (id) => `chat:u:${id}`;
