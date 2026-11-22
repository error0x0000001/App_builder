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
  const replaced = new Set(); // workers whose replacement was already started when they announced retirement
  cluster.on('message', (worker, message) => {
    if (message?.type !== 'retiring' || shuttingDown) return;
    replaced.add(worker.id);
    fork(); // the replacement boots while the old worker drains, so capacity never dips
  });
  cluster.on('exit', (worker, code, signal) => {
    if (replaced.delete(worker.id)) return;
    logger.info({ pid: worker.process.pid, code, signal }, 'worker exited unexpectedly, respawning');
    if (!shuttingDown) fork();
  });
  let shuttingDown = false;
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { shuttingDown = true; for (const w of Object.values(cluster.workers)) w.process.kill(sig); });
  logger.info(`API primary supervising ${config.API_WORKERS} workers`);
}

const DRAIN_MS = 2500;

/**
 * Express middleware: counts requests and retires the worker (gracefully) when over a limit. Retiring = leave the
 * cluster so no new connections arrive, tell clients on this worker `Connection: close` for a short drain window (so
 * keep-alive connections move over instead of being cut mid-reuse), then call `onRetire` to stop.
 */
export const workerRecycler = (onRetire) => {
  let served = 0; let retiring = false;
  const maxRequests = config.API_MAX_REQUESTS * (0.8 + Math.random() * 0.4); // jitter: workers never retire in lockstep
  const retire = (info) => {
    retiring = true;
    logger.info(info, 'worker limit reached, retiring');
    process.send?.({ type: 'retiring' });
    // Keep serving (with `Connection: close`) for the drain window; only then leave the cluster and stop.
    setTimeout(() => { if (cluster.isWorker) cluster.worker.disconnect(); onRetire(); }, DRAIN_MS).unref();
  };
  return (req, res, next) => {
    if (retiring) res.set('Connection', 'close');
    res.once('finish', () => {
      if (retiring || ++served % CHECK_EVERY !== 0) return;
      const rssMb = process.memoryUsage.rss() / 1048576;
      if (served >= maxRequests || rssMb > config.API_MAX_RSS_MB) retire({ served, rssMb: Math.round(rssMb) });
    });
    next();
  };
};
