import { Router } from 'express';
import { z } from 'zod';
import { uuidField } from '@app/shared';
import { TooManyRequestsError } from '../../../shared/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveTenantRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { evaluateBodySchema, fieldBodySchema, fieldListQuery, fieldPatchSchema, objectBodySchema, objectListQuery, objectPatchSchema, optionsQuery, orderSchema } from '../../../modules/objects/schemas.js';

const objectParam = z.object({ id: uuidField });
const fieldParam = objectParam.extend({ fieldId: uuidField });

/**
 * Object and field definitions (configuration). Admins only. The browser renders what these endpoints return:
 * lists are searched, filtered, sorted and paged here; `evaluate` resolves every field's behaviour for the values sent.
 */
export function objectsRoutes({ tokens, membershipLookup, objectDefs, workspaces, cache }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveTenantRole(membershipLookup, 'admin'), requireWorkspace(workspaces));
  const tenant = (req) => req.auth.tenantId; const user = (req) => req.auth.userId;
  const limited = (name, perMinute) => (req, res, next) => (cache.allow(`${name}:${user(req)}`, 60, perMinute) ? next() : next(new TooManyRequestsError(60)));

  router.get('/meta', async (req, res) => res.json(objectDefs.meta()));
  router.get('/', validate({ query: objectListQuery }), async (req, res) => res.json(await objectDefs.listObjects(tenant(req), req.valid.query)));
  router.post('/', limited('obj-write', 60), validate({ body: objectBodySchema }), async (req, res) => res.status(201).json({ object: await objectDefs.createObject({ tenantId: tenant(req), userId: user(req), body: req.valid.body }) }));
  router.get('/:id', validate({ params: objectParam }), async (req, res) => res.json(await objectDefs.get(tenant(req), req.params.id)));
  router.patch('/:id', limited('obj-write', 60), validate({ params: objectParam, body: objectPatchSchema }), async (req, res) => res.json({ object: await objectDefs.updateObject({ tenantId: tenant(req), userId: user(req), id: req.params.id, body: req.valid.body }) }));
  router.post('/:id/archive', limited('obj-write', 60), validate({ params: objectParam }), async (req, res) => { await objectDefs.setArchived({ tenantId: tenant(req), userId: user(req), id: req.params.id, archived: true }); res.status(204).end(); });
  router.post('/:id/restore', limited('obj-write', 60), validate({ params: objectParam }), async (req, res) => { await objectDefs.setArchived({ tenantId: tenant(req), userId: user(req), id: req.params.id, archived: false }); res.status(204).end(); });

  router.get('/:id/fields', validate({ params: objectParam, query: fieldListQuery }), async (req, res) => res.json(await objectDefs.listFields(tenant(req), req.params.id, req.valid.query)));
  router.post('/:id/fields', limited('obj-write', 120), validate({ params: objectParam, body: fieldBodySchema }), async (req, res) => res.status(201).json({ field: await objectDefs.createField({ tenantId: tenant(req), userId: user(req), objectId: req.params.id, body: req.valid.body }) }));
  router.put('/:id/fields/order', limited('obj-write', 60), validate({ params: objectParam, body: orderSchema }), async (req, res) => { await objectDefs.reorder({ tenantId: tenant(req), userId: user(req), objectId: req.params.id, ids: req.valid.body.ids }); res.status(204).end(); });
  router.patch('/:id/fields/:fieldId', limited('obj-write', 120), validate({ params: fieldParam, body: fieldPatchSchema }), async (req, res) => res.json({ field: await objectDefs.updateField({ tenantId: tenant(req), userId: user(req), objectId: req.params.id, fieldId: req.params.fieldId, body: req.valid.body }) }));
  router.delete('/:id/fields/:fieldId', limited('obj-write', 60), validate({ params: fieldParam }), async (req, res) => { await objectDefs.deleteField({ tenantId: tenant(req), userId: user(req), objectId: req.params.id, fieldId: req.params.fieldId }); res.status(204).end(); });
  router.get('/:id/fields/:fieldId/options', limited('obj-options', 240), validate({ params: fieldParam, query: optionsQuery }), async (req, res) => {
    res.json(await objectDefs.options({ tenantId: tenant(req), objectId: req.params.id, fieldId: req.params.fieldId, query: req.valid.query, person: await objectDefs.personFor(tenant(req), req.auth, req.membership, req.workspaceId) }));
  });

  router.get('/:id/fields/:fieldId/sequence', validate({ params: fieldParam }), async (req, res) => {
    res.json(await objectDefs.sequenceStatus({ tenantId: tenant(req), objectId: req.params.id, fieldId: req.params.fieldId, person: await objectDefs.personFor(tenant(req), req.auth, req.membership, req.workspaceId) }));
  });

  router.post('/:id/evaluate', limited('obj-eval', 600), validate({ params: objectParam, body: evaluateBodySchema }), async (req, res) => {
    res.json(await objectDefs.evaluate({ tenantId: tenant(req), objectId: req.params.id, body: req.valid.body, person: await objectDefs.personFor(tenant(req), req.auth, req.membership, req.workspaceId) }));
  });
  return router;
}
