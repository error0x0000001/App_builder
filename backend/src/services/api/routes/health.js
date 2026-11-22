import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../../shared/db/index.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});
