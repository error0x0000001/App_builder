import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { sql } from 'drizzle-orm';
import { config } from '../../shared/config.js';
import { db } from '../../shared/db/index.js';
import { logger } from '../../shared/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { authRoutes } from './routes/auth.routes.js';
import { driveRoutes } from './routes/drive.routes.js';
import { peopleRoutes } from './routes/people.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { invitationRoutes } from './routes/invitations.routes.js';
import { meRoutes } from './routes/me.routes.js';
import { objectRoutes } from './routes/objects.routes.js';
import { publicRoutes } from './routes/public.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { setupRoutes } from './routes/setup.routes.js';
import { integrationsRoutes } from './routes/integrations.routes.js';
import { deploymentsRoutes } from './routes/deployments.routes.js';
import { workspaceRoutes } from './routes/workspaces.routes.js';

export function createApp(container, { recycler } = {}) {
  const app = express();
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.APP_URL, credentials: true }));
  // LiveKit posts signed webhooks as application/webhook+json; the signature covers the exact bytes, so keep them raw (before the JSON parser).
  // Push-to-deploy webhooks (GitHub / GitLab / Gitea): signed, so the raw bytes are needed before the JSON parser.
  if (container.deployments) {
    app.post('/api/v1/deployments/hooks/:serviceId', express.raw({ type: '*/*', limit: '2mb' }), async (req, res, next) => {
      try { const out = await container.deployments.handleWebhook(req.params.serviceId, { headers: req.headers, query: req.query, rawBody: req.body ?? Buffer.alloc(0) }); res.status(out.status).json(out.body); } catch (error) { next(error); }
    });
  }
  app.post('/api/v1/calls/livekit-webhook', express.raw({ type: '*/*', limit: '64kb' }), async (req, res, next) => {
    try { res.json(await container.calls.onWebhook(req.body, req.get('authorization'))); } catch (error) { next(error); }
  });
  app.use(express.json({ limit: '100kb' }));
  // Successful requests are not logged by default (at thousands/second the log line costs more than the response);
  // 4xx/5xx always are, and LOG_ACCESS=true restores full access logs.
  app.use(pinoHttp({ logger, customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : config.LOG_ACCESS && !req.url.startsWith('/health') ? 'info' : 'silent') }));
  app.use(requestContext);
  if (recycler) app.use(recycler);

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  app.use('/api/v1/auth', cookieParser(), authRoutes(container)); // only the auth flows read cookies
  app.use('/api/v1/me', meRoutes(container));
  app.use('/api/v1/workspaces', workspaceRoutes(container));
  app.use('/api/v1/invitations', invitationRoutes(container));
  app.use('/api/v1/setup', setupRoutes(container));
  app.use('/api/v1/integrations', integrationsRoutes(container));
  if (container.deployments) app.use('/api/v1/deployments', deploymentsRoutes(container)); // not mounted when DEPLOYMENTS_ENABLED=false: the paths do not exist
  app.use('/api/v1/objects', objectRoutes(container));
  app.use('/api/v1/search', searchRoutes(container));
  app.use('/api/v1/drive', driveRoutes(container));
  app.use('/api/v1/chat', chatRoutes(container));
  for (const [kind, store] of [['avatars', 'avatars'], ['chat-icons', 'icons']]) { // signed, immutable photos: no bearer needed for <img>
    app.get(`/api/v1/${kind}/:id/:version.jpg`, (req, res, next) => {
      try {
        const stream = container[store].open(req.params.id, Number(req.params.version), req.query.s);
        stream.on('error', () => res.status(404).end());
        res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        stream.pipe(res);
      } catch (error) { next(error); }
    });
  }
  app.use('/api/v1/people', peopleRoutes(container));
  app.use('/api/v1/public', publicRoutes(container));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
