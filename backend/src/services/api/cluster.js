import cluster from 'node:cluster';
import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';

const CHECK_EVERY = 500;

/**
 * Prefork: the primary forks API_WORKERS processes and respawns any that exit. Workers retire themselves after
 * API_MAX_REQUESTS requests or API_MAX_RSS_MB of memory (checked between requests, so none is cut mid-flight) — the
 * Odoo PreforkServer model. A single worker (API_WORKERS=1) runs in-process with no primary.
 */
export function runPrimaryOrWorker(startWorker) {
  if (config.API_WORKERS <= 1) return startWorker();
  if (!cluster.isPrimary) return startWorker();

  const fork = () => cluster.fork();
  for (let i = 0; i < config.API_WORKERS; i++) fork();
  cluster.on('exit', (worker, code, signal) => {
    logger.info({ pid: worker.process.pid, code, signal }, 'worker exited, respawning');
    if (!shuttingDown) fork();
  });
  let shuttingDown = false;
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { shuttingDown = true; for (const w of Object.values(cluster.workers)) w.process.kill(sig); });
  logger.info(`API primary supervising ${config.API_WORKERS} workers`);
}

/** Express middleware: counts requests and asks the process to retire (gracefully) when over a limit. */
export const workerRecycler = (onRetire) => {
  let served = 0; let retiring = false;
  return (req, res, next) => {
    res.once('finish', () => {
      if (retiring || ++served % CHECK_EVERY !== 0) return;
      const rssMb = process.memoryUsage.rss() / 1048576;
      if (served >= config.API_MAX_REQUESTS || rssMb > config.API_MAX_RSS_MB) {
        retiring = true;
        logger.info({ served, rssMb: Math.round(rssMb) }, 'worker limit reached, retiring');
        onRetire();
      }
    });
    next();
  };
};
