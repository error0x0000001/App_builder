import { config } from '../../shared/config.js';
import { pool } from '../../shared/db/index.js';
import { logger } from '../../shared/logger.js';
import { createBoss } from '../../shared/queue.js';
import { createApp } from './app.js';
import cluster from 'node:cluster';
import { runPrimaryOrWorker, workerRecycler } from './cluster.js';
import { createContainer } from './container.js';

async function startWorker() {
  const boss = await createBoss();
  const container = createContainer({ boss });
  let server;
  async function shutdown() {
    logger.info('API shutting down');
    server.close();
    await container.close();
    await boss.stop();
    await pool.end();
    process.exit(0);
  }
  server = createApp(container, { recycler: cluster.isWorker ? workerRecycler(shutdown) : undefined }) // retire only when a primary will respawn us
    .listen(config.PORT, () => logger.info(`API listening on :${config.PORT}`));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

runPrimaryOrWorker(startWorker);
