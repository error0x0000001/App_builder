import { config } from '../../shared/config.js';
import { db, pool } from '../../shared/db/index.js';
import { logger } from '../../shared/logger.js';
import { createMailer } from '../../shared/mail/mailer.js';
import { QUEUES, createBoss } from '../../shared/queue.js';
import { CleanupService } from '../../modules/maintenance/cleanup.service.js';
import { createRepositories } from '../../modules/repositories.js';
import { createCleanupJob } from './jobs/cleanup.js';
import { createSendEmailJob } from './jobs/sendEmail.js';

const boss = await createBoss();
const cleanup = new CleanupService({ repos: createRepositories(db), logger });

// Register new jobs here: queue name -> handler (one job per call, parallelism via batchSize).
const handlers = {
  [QUEUES.SEND_EMAIL]: createSendEmailJob(createMailer()),
  [QUEUES.CLEANUP]: createCleanupJob(cleanup),
};

for (const [queue, handler] of Object.entries(handlers)) {
  await boss.work(queue, { batchSize: config.WORKER_CONCURRENCY }, async (jobs) => {
    await Promise.all(jobs.map(handler));
  });
  logger.info(`Worker listening on queue "${queue}"`);
}
await boss.schedule(QUEUES.CLEANUP, '0 3 * * *'); // daily at 03:00

async function shutdown() {
  logger.info('Worker shutting down');
  await boss.stop();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
