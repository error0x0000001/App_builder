import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../../shared/config.js';
import { TooManyRequestsError } from '../../../shared/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveTenantRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { requireWorkspace } from '../middleware/workspace.js';

const query = z.object({ q: z.string().max(100).default(''), type: z.enum(['all', 'records', 'people', 'navigation', 'documents']).default('all') });

/** Global search (⌘K). Any organisation member; what comes back is limited by their own permissions. */
export function searchRoutes({ tokens, membershipLookup, cache, search, users, workspaces }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveTenantRole(membershipLookup, 'viewer'), requireWorkspace(workspaces));
  router.get('/', validate({ query }), async (req, res) => {
    if (!cache.allow(`search:${req.auth.userId}`, 10, config.SEARCH_REQUESTS_PER_10S)) throw new TooManyRequestsError(10); // typing is bursty; this is a ceiling, not a throttle
    const entry = await search.search({ tenantId: req.auth.tenantId, workspaceId: req.workspaceId, userId: req.auth.userId, actor: req.membership, email: await users.emailOf(req.auth.userId) }, req.valid.query);
    res.set({ ETag: entry.etag, 'Cache-Control': 'private, max-age=5' });
    if (req.get('if-none-match') === entry.etag) return res.status(304).end();
    return res.type('application/json').send(entry.body);
  });
  return router;
}
