import { Router } from 'express';
import { z } from 'zod';
import { approvalDecisionSchema, setupIdsSchema, setupListQuerySchema, uuidField } from '@app/shared';
import { TooManyRequestsError } from '../../../shared/errors.js';
import { config } from '../../../shared/config.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveWorkspaceRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const objectParam = z.object({ object: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/) });
const recordParam = objectParam.extend({ id: uuidField });

/** Records of Object Manager objects. Any member may call; what they can do is decided per object by Profiles / Permission Sets / Sharing (AccessService). Tenant always comes from the verified membership. */
export function objectRoutes({ tokens, membershipLookup, cache, objects, users }) {
  const router = Router();
  router.use(authenticate(tokens));
  const role = (minimum) => requireActiveWorkspaceRole(membershipLookup, minimum);

  /** Fills req.objectCtx (workspace, user, email, role) and applies the per-workspace request ceiling. */
  router.use(role('viewer'), async (req, res, next) => {
    try {
      const ws = req.auth.workspaceId;
      if (!cache.allow(`objects:${ws}`, 60, config.SETUP_REQUESTS_PER_MINUTE)) throw new TooManyRequestsError(60);
      if (req.method !== 'GET' && (await cache.hit(`objects-w:${ws}:${req.auth.userId}`, 60)) > 300) throw new TooManyRequestsError(60);
      req.objectCtx = { workspaceId: ws, userId: req.auth.userId, actor: req.membership, email: await users.emailOf(req.auth.userId), ip: req.ctx.ip };
      next();
    } catch (error) { next(error); }
  });

  router.get('/:object', validate({ params: objectParam }), async (req, res) => {
    const def = await objects.definition(req.objectCtx.workspaceId, req.params.object);
    if (!def) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown object' } });
    res.set('Cache-Control', 'private, no-cache').json({ definition: def, permissions: await objects.permissions(req.objectCtx, req.params.object) });
  });

  router.get('/:object/records', validate({ params: objectParam, query: setupListQuerySchema }), async (req, res) => {
    const entry = await objects.list(req.objectCtx, req.params.object, req.valid.query);
    res.set({ ETag: entry.etag, 'Cache-Control': 'private, no-cache' });
    if (req.get('if-none-match') === entry.etag) return res.status(304).end();
    return res.type('application/json').send(entry.body);
  });

  router.post('/:object/records', validate({ params: objectParam }), async (req, res) => {
    res.status(201).json(await objects.create(req.objectCtx, req.params.object, req.body));
  });
  router.patch('/:object/records/:id', validate({ params: recordParam }), async (req, res) => {
    res.json(await objects.update(req.objectCtx, req.params.object, req.params.id, req.body));
  });
  router.post('/:object/records/delete', validate({ params: objectParam, body: setupIdsSchema }), async (req, res) => {
    res.json({ removed: await objects.remove(req.objectCtx, req.params.object, req.valid.body.ids) });
  });
  router.post('/:object/records/:id/approval', validate({ params: recordParam, body: approvalDecisionSchema }), async (req, res) => {
    res.json(await objects.decide(req.objectCtx, req.params.object, req.params.id, req.valid.body));
  });
  return router;
}
