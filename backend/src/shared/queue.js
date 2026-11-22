import PgBoss from 'pg-boss';
import { config } from './config.js';

export const QUEUES = Object.freeze({
  SEND_EMAIL: 'send-email',
  CLEANUP: 'cleanup-expired',
  EXPIRE_PASSWORDS: 'setup-expire-passwords',
});

const QUEUE_OPTIONS = {
  [QUEUES.SEND_EMAIL]: { retryLimit: 5, retryDelay: 10, retryBackoff: true, deleteAfterSeconds: 3600 },
  [QUEUES.CLEANUP]: { retryLimit: 1 },
  [QUEUES.EXPIRE_PASSWORDS]: { retryLimit: 3, retryDelay: 30, retryBackoff: true, deleteAfterSeconds: 86_400 },
};

export async function createBoss() {
  const boss = new PgBoss(config.DATABASE_URL);
  await boss.start();
  for (const [name, options] of Object.entries(QUEUE_OPTIONS)) await boss.createQueue(name, options);
  return boss;
}
