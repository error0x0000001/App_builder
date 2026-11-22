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
import { invitationRoutes } from './routes/invitations.routes.js';
import { meRoutes } from './routes/me.routes.js';
import { workspaceRoutes } from './routes/workspaces.routes.js';

export function createApp(container) {
  const app = express();
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.APP_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url.startsWith('/health') } }));
  app.use(requestContext);

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  app.use('/api/v1/auth', authRoutes(container));
  app.use('/api/v1/me', meRoutes(container));
  app.use('/api/v1/workspaces', workspaceRoutes(container));
  app.use('/api/v1/invitations', invitationRoutes(container));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
