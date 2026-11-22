import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';
import { pool } from '../../shared/db/index.js';
import { createBoss, QUEUES } from '../../shared/queue.js';
import { welcomeEmail } from './jobs/welcomeEmail.js';

// Register new jobs here: queue name -> handler.
const handlers = {
  [QUEUES.WELCOME_EMAIL]: welcomeEmail,
};

const boss = await createBoss();

for (const [queue, handler] of Object.entries(handlers)) {
  await boss.work(queue, { batchSize: config.WORKER_CONCURRENCY }, async (jobs) => {
    await Promise.all(jobs.map(handler));
  });
  logger.info(`Worker listening on queue "${queue}"`);
}

async function shutdown() {
  logger.info('Worker shutting down');
  await boss.stop();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
