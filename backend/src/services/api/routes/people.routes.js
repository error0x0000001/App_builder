import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveTenantRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

export function peopleRoutes({ tokens, membershipLookup, people }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveTenantRole(membershipLookup, 'viewer'));
  router.get('/', validate({ query: z.object({ q: z.string().trim().min(2).max(60) }) }), async (req, res) => {
    res.set('Cache-Control', 'private, no-store').json(await people.search(req.auth.tenantId, req.valid.query.q));
  });
  return router;
}
