import PgBoss from 'pg-boss';
import { config } from './config.js';

export const QUEUES = {
  WELCOME_EMAIL: 'welcome-email',
};

export async function createBoss() {
  const boss = new PgBoss(config.DATABASE_URL);
  await boss.start();
  for (const name of Object.values(QUEUES)) await boss.createQueue(name);
  return boss;
}
