import { Router } from 'express';
import { z } from 'zod';
import { integrationBodySchema, integrationEnableSchema } from '@app/shared';
import { NotFoundError } from '../../../shared/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveTenantRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const provider = z.object({ provider: z.string().max(40) });

/** Tenant integrations (email, storage, maps…). Admins only; secrets go in, never come out. */
export function integrationsRoutes({ tokens, membershipLookup, integrations, rateLimit }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveTenantRole(membershipLookup, 'admin'));
  const ctx = (req) => ({ tenantId: req.auth.tenantId, userId: req.auth.userId });

  router.get('/', async (req, res) => res.json({ integrations: await integrations.list(req.auth.tenantId) }));

  router.put('/:provider', validate({ params: provider }), (req, res, next) => {
    const schema = integrationBodySchema(req.params.provider);
    return schema ? validate({ body: schema })(req, res, next) : next(new NotFoundError('Unknown integration'));
  }, async (req, res) => res.json({ integration: await integrations.save(ctx(req), req.params.provider, req.valid.body) }));

  router.post('/:provider/test', rateLimit.ip('integration-test', 20, 600), validate({ params: provider }), async (req, res) => res.json({ integration: await integrations.test(ctx(req), req.params.provider) }));
  router.post('/:provider/enabled', validate({ params: provider, body: integrationEnableSchema }), async (req, res) => res.json({ integrations: await integrations.setEnabled(ctx(req), req.params.provider, req.valid.body.enabled) }));
  router.delete('/:provider', validate({ params: provider }), async (req, res) => res.json({ integrations: await integrations.disconnect(ctx(req), req.params.provider) }));
  return router;
}
