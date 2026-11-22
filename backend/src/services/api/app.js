import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';
import { healthRouter } from './routes/health.js';
import { usersRouter } from './routes/users.js';

export function createApp({ boss }) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);
  app.use('/api/users', usersRouter({ boss }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.issues });
    if (err.code === '23505') return res.status(409).json({ error: 'Already exists' });
    req.log.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
