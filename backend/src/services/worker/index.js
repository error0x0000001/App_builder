import { config } from '../../shared/config.js';
import { db, pool } from '../../shared/db/index.js';
import { logger } from '../../shared/logger.js';
import { createMailer } from '../../shared/mail/mailer.js';
import { QUEUES, createBoss } from '../../shared/queue.js';
import { CleanupService } from '../../modules/maintenance/cleanup.service.js';
import { createRepositories } from '../../modules/repositories.js';
import { OneTimeTokenService } from '../../modules/authTokens/oneTimeToken.service.js';
import { MailService } from '../../modules/mail/mail.service.js';
import { PasswordExpiryService } from '../../modules/setup/passwordExpiry.service.js';
import { createCleanupJob } from './jobs/cleanup.js';
import { createSendEmailJob } from './jobs/sendEmail.js';

const boss = await createBoss();
const repos = createRepositories(db);
const cleanup = new CleanupService({ repos, logger });
const passwordExpiry = new PasswordExpiryService({ repos, oneTime: new OneTimeTokenService({ repos, pepper: config.JWT_SECRET }), mail: new MailService({ boss }), logger });

// Register new jobs here: queue name -> handler (one job per call, parallelism via batchSize).
const handlers = {
  [QUEUES.SEND_EMAIL]: createSendEmailJob(createMailer()),
  [QUEUES.CLEANUP]: createCleanupJob(cleanup),
  [QUEUES.EXPIRE_PASSWORDS]: (job) => passwordExpiry.run(job.data),
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
