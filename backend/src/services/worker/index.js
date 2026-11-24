import { config } from '../../shared/config.js';
import { db, pool } from '../../shared/db/index.js';
import { logger } from '../../shared/logger.js';
import { createMailer } from '../../shared/mail/mailer.js';
import { QUEUES, createBoss } from '../../shared/queue.js';
import { CleanupService } from '../../modules/maintenance/cleanup.service.js';
import { createRepositories } from '../../modules/repositories.js';
import { OneTimeTokenService } from '../../modules/authTokens/oneTimeToken.service.js';
import { MailService } from '../../modules/mail/mail.service.js';
import { AutomationService } from '../../modules/automation/automation.service.js';
import { EscalationService } from '../../modules/automation/escalation.service.js';
import { createCache } from '../../shared/cache/redis.js';
import { EmailPolicyService } from '../../modules/setup/emailPolicy.service.js';
import { SettingsReader } from '../../modules/setup/settingsReader.js';
import { PasswordExpiryService } from '../../modules/setup/passwordExpiry.service.js';
import { ChatRetentionService } from '../../modules/chat/retention.service.js';
import { LocalStorageDriver } from '../../shared/storage/localStorage.js';
import { createCleanupJob } from './jobs/cleanup.js';
import { createSendEmailJob } from './jobs/sendEmail.js';
import { ChannelNotifier, createNotifyJob } from '../../modules/integrations/channelNotifier.js';
import { createDeployments } from '../../modules/deployments/index.js';
import { SecretBox } from '../../shared/security/crypto.js';
import { IntegrationsService } from '../../modules/integrations/integrations.service.js';

const boss = await createBoss();
const repos = createRepositories(db);
const cache = createCache();
const integrations = new IntegrationsService({ db, secretBox: new SecretBox(config.ENCRYPTION_KEY), repos, allowPrivate: config.INTEGRATIONS_ALLOW_PRIVATE_HOSTS });
const cleanup = new CleanupService({ repos, logger });
const chatRetention = new ChatRetentionService({ db, storage: new LocalStorageDriver(config.STORAGE_DIR), logger });
const notifier = new ChannelNotifier({ boss, integrations, logger });
const deployments = createDeployments({ enabled: config.DEPLOYMENTS_ENABLED, db, secretBox: new SecretBox(config.ENCRYPTION_KEY), repos, integrations, notifier, boss, logger });
const escalation = new EscalationService({ repos, cache, logger, automation: new AutomationService({ repos, cache, mail: new MailService({ boss }), notifier, logger, settings: new SettingsReader({ repos, cache }) }) });
const passwordExpiry = new PasswordExpiryService({ repos, oneTime: new OneTimeTokenService({ repos, pepper: config.JWT_SECRET }), mail: new MailService({ boss }), logger });

// Register new jobs here: queue name -> handler (one job per call, parallelism via batchSize).
const handlers = {
  [QUEUES.SEND_EMAIL]: createSendEmailJob(createMailer(), { repos, workspaceMailer: integrations.mailerFor(), emailPolicy: new EmailPolicyService({ settings: new SettingsReader({ repos, cache }) }) }),
  [QUEUES.NOTIFY_CHANNELS]: createNotifyJob(integrations, { allowPrivate: config.INTEGRATIONS_ALLOW_PRIVATE_HOSTS }),
  ...(deployments ? {
    [QUEUES.DEPLOY]: (job) => (job.data.jobId ? deployments.runJobDeployment(job.data) : deployments.run(job.data)),
    [QUEUES.DEPLOY_TICK]: () => deployments.tick(),
  } : {}),
  [QUEUES.CLEANUP]: createCleanupJob(cleanup),
  [QUEUES.ESCALATE_CASES]: () => escalation.run(),
  [QUEUES.PURGE_CHAT]: () => chatRetention.purgeExpired(),
  [QUEUES.EXPIRE_PASSWORDS]: (job) => passwordExpiry.run(job.data),
};

for (const [queue, handler] of Object.entries(handlers)) {
  // Deployments take minutes: each gets its own worker loop (a batch would hold every job in it until the slowest finishes).
  const loops = queue === QUEUES.DEPLOY ? Math.max(2, config.WORKER_CONCURRENCY) : 1;
  for (let i = 0; i < loops; i += 1) {
    await boss.work(queue, { batchSize: queue === QUEUES.DEPLOY ? 1 : config.WORKER_CONCURRENCY }, async (jobs) => {
      await Promise.all(jobs.map(handler));
    });
  }
  logger.info(`Worker listening on queue "${queue}"`);
}
if (deployments) await boss.schedule(QUEUES.DEPLOY_TICK, '* * * * *'); // scheduled commands and backups
await boss.schedule(QUEUES.CLEANUP, '0 3 * * *'); // daily at 03:00
await boss.schedule(QUEUES.ESCALATE_CASES, '*/15 * * * *'); // Escalation Rules, every 15 minutes
await boss.schedule(QUEUES.PURGE_CHAT, '* * * * *'); // disappearing messages, every minute

async function shutdown() {
  logger.info('Worker shutting down');
  await boss.stop();
  await cache.close?.();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
