import PgBoss from 'pg-boss';
import { config } from './config.js';

export const QUEUES = Object.freeze({
  SEND_EMAIL: 'send-email',
  CLEANUP: 'cleanup-expired',
  EXPIRE_PASSWORDS: 'setup-expire-passwords',
  PURGE_CHAT: 'purge-expired-chat',
  NOTIFY_CHANNELS: 'notify-channels',
  DEPLOY: 'deployments-run',
  DEPLOY_TICK: 'deployments-tick',
});

const QUEUE_OPTIONS = {
  [QUEUES.SEND_EMAIL]: { retryLimit: 5, retryDelay: 10, retryBackoff: true, deleteAfterSeconds: 3600 },
  [QUEUES.NOTIFY_CHANNELS]: { retryLimit: 4, retryDelay: 15, retryBackoff: true, deleteAfterSeconds: 3600 },
  [QUEUES.DEPLOY]: { retryLimit: 0, deleteAfterSeconds: 86_400, expireInSeconds: 3 * 3600 },
  [QUEUES.DEPLOY_TICK]: { retryLimit: 0 },
  [QUEUES.CLEANUP]: { retryLimit: 1 },
  [QUEUES.PURGE_CHAT]: { retryLimit: 1 },
  [QUEUES.EXPIRE_PASSWORDS]: { retryLimit: 3, retryDelay: 30, retryBackoff: true, deleteAfterSeconds: 86_400 },
};

/** `max` = pool size; API workers only enqueue, so they use a small pool. */
export async function createBoss({ max = 4 } = {}) {
  const boss = new PgBoss({ connectionString: config.DATABASE_URL, max });
  await boss.start();
  for (const [name, options] of Object.entries(QUEUE_OPTIONS)) await boss.createQueue(name, options);
  return boss;
}
