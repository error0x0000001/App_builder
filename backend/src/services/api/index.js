import { config } from '../../shared/config.js';
import { pool } from '../../shared/db/index.js';
import { logger } from '../../shared/logger.js';
import { createBoss } from '../../shared/queue.js';
import { createApp } from './app.js';
import { createContainer } from './container.js';

const boss = await createBoss();
const server = createApp(createContainer({ boss })).listen(config.PORT, () => logger.info(`API listening on :${config.PORT}`));

async function shutdown() {
  logger.info('API shutting down');
  server.close();
  await boss.stop();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
