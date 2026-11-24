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
  let stopping = false;
  /** Graceful stop: leave the cluster (no new connections), let in-flight requests finish, then release resources. */
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    logger.info('API shutting down');
    await container.terminals?.close();
    await container.realtime.close(); // WebSockets are long-lived: close them first so server.close() can finish
    const closed = new Promise((resolve) => server.close(resolve)); // also closes idle keep-alive connections
    const force = setTimeout(() => server.closeAllConnections(), 10_000);
    force.unref();
    await closed;
    clearTimeout(force);
    await container.close();
    await boss.stop();
    await pool.end();
    process.exit(0);
  }
  server = createApp(container, { recycler: cluster.isWorker ? workerRecycler(shutdown) : undefined }) // retire only when a primary will respawn us
    .listen(config.PORT, () => logger.info(`API listening on :${config.PORT}`));
  container.realtime.attach(server);
  container.terminals?.attach(server);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

runPrimaryOrWorker(startWorker);
