import { Router } from 'express';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { db } from '../../../shared/db/index.js';
import { users } from '../../../shared/db/schema.js';
import { QUEUES } from '../../../shared/queue.js';

const createSchema = z.object({ email: z.string().email(), name: z.string().min(1) });

// Express 4 doesn't catch async errors, so wrap handlers.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function usersRouter({ boss }) {
  const router = Router();

  router.get('/', wrap(async (req, res) => {
    res.json(await db.select().from(users).orderBy(desc(users.createdAt)).limit(100));
  }));

  router.post('/', wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [user] = await db.insert(users).values(data).returning();
    await boss.send(QUEUES.WELCOME_EMAIL, { userId: user.id, email: user.email });
    res.status(201).json(user);
  }));

  return router;
}
