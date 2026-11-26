import { Router } from 'express';
import { z } from 'zod';
import { uuidField } from '@app/shared';
import { TooManyRequestsError } from '../../../shared/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveTenantRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { requireWorkspace } from '../middleware/workspace.js';
import * as S from '../../../modules/apps/schemas.js';

const key = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/) });
const id = (name) => z.object({ [name]: uuidField });
const sendCached = (req, res, { body, etag }) => {
  res.set({ ETag: etag, 'Cache-Control': 'private, no-cache' }); // revalidated every time; a 304 costs almost nothing
  if (req.get('if-none-match') === etag) return res.status(304).end();
  return res.json(body);
};

/**
 * Apps, menus, pages and blocks. Reading is open to anyone who may open the app; every change is an admin "Studio" command.
 * Pages carry an ETag, so a repeat visit is answered with a 304.
 */
export function appsRoutes({ tokens, membershipLookup, appService: apps, workspaces, cache }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveTenantRole(membershipLookup, 'viewer'), requireWorkspace(workspaces));
  const admin = requireActiveTenantRole(membershipLookup, 'admin');
  const t = (req) => req.auth.tenantId; const u = (req) => req.auth.userId;
  const limited = (name, perMinute) => (req, res, next) => (cache.allow(`${name}:${u(req)}`, 60, perMinute) ? next() : next(new TooManyRequestsError(60)));
  const write = [admin, limited('apps-write', 240)];
  const read = (req) => ({ tenantId: t(req), auth: req.auth, membership: req.membership, workspaceId: req.workspaceId });

  router.get('/meta', (req, res) => res.json(apps.meta()));
  router.get('/', async (req, res) => res.json(await apps.launcher(t(req), req.auth, req.membership, req.workspaceId)));
  router.get('/admin/all', admin, async (req, res) => res.json(await apps.adminApps(t(req))));
  router.post('/', ...write, validate({ body: S.appBodySchema }), async (req, res) => res.status(201).json({ app: await apps.createApp({ tenantId: t(req), userId: u(req), body: req.valid.body }) }));
  router.put('/order', ...write, validate({ body: S.orderSchema }), async (req, res) => { await apps.reorderApps({ tenantId: t(req), userId: u(req), ids: req.valid.body.ids }); res.status(204).end(); });

  router.get('/pages/:routeId', validate({ params: id('routeId'), query: S.pageQuerySchema }), async (req, res) => sendCached(req, res, await apps.pageBundle({ ...read(req), routeId: req.params.routeId, tabId: req.valid.query.tab })));
  router.post('/pages/:routeId/tabs', ...write, validate({ params: id('routeId'), body: S.tabBodySchema }), async (req, res) => res.status(201).json({ tab: await apps.createTab({ tenantId: t(req), userId: u(req), routeId: req.params.routeId, body: req.valid.body }) }));
  router.patch('/routes/:routeId', ...write, validate({ params: id('routeId'), body: S.routePatchSchema }), async (req, res) => res.json({ route: await apps.updateRoute({ tenantId: t(req), userId: u(req), routeId: req.params.routeId, body: req.valid.body }) }));
  router.delete('/routes/:routeId', ...write, validate({ params: id('routeId') }), async (req, res) => { await apps.deleteRoute({ tenantId: t(req), userId: u(req), routeId: req.params.routeId }); res.status(204).end(); });
  router.put('/routes-order', ...write, validate({ body: S.orderSchema }), async (req, res) => { await apps.reorderRoutes({ tenantId: t(req), userId: u(req), ids: req.valid.body.ids }); res.status(204).end(); });
  router.put('/tabs-order', ...write, validate({ body: S.orderSchema }), async (req, res) => { await apps.reorderTabs({ tenantId: t(req), userId: u(req), ids: req.valid.body.ids }); res.status(204).end(); });
  router.patch('/tabs/:tabId', ...write, validate({ params: id('tabId'), body: S.tabPatchSchema }), async (req, res) => res.json({ tab: await apps.updateTab({ tenantId: t(req), userId: u(req), tabId: req.params.tabId, body: req.valid.body }) }));
  router.delete('/tabs/:tabId', ...write, validate({ params: id('tabId') }), async (req, res) => { await apps.deleteTab({ tenantId: t(req), userId: u(req), tabId: req.params.tabId }); res.status(204).end(); });

  router.post('/tabs/:tabId/blocks', ...write, validate({ params: id('tabId'), body: S.blockBodySchema }), async (req, res) => res.status(201).json(await apps.addBlock({ tenantId: t(req), userId: u(req), tabId: req.params.tabId, body: req.valid.body })));
  router.post('/tabs/:tabId/rows/:rowId/columns', ...write, validate({ params: id('tabId').extend({ rowId: uuidField }), body: S.addColumnSchema }), async (req, res) => res.status(201).json(await apps.addColumn({ tenantId: t(req), userId: u(req), tabId: req.params.tabId, rowId: req.params.rowId })));
  router.patch('/columns/:columnId', ...write, validate({ params: id('columnId'), body: S.columnWidthSchema }), async (req, res) => { await apps.setColumnWidth({ tenantId: t(req), userId: u(req), columnId: req.params.columnId, widthPct: req.valid.body.widthPct }); res.status(204).end(); });
  router.delete('/columns/:columnId', ...write, validate({ params: id('columnId') }), async (req, res) => { await apps.deleteColumn({ tenantId: t(req), userId: u(req), columnId: req.params.columnId }); res.status(204).end(); });
  router.get('/blocks/:blockId/data', limited('apps-data', 600), validate({ params: id('blockId'), query: S.dataQuerySchema }), async (req, res) => res.set('Cache-Control', 'private, max-age=0').json(await apps.blockData({ tenantId: t(req), blockId: req.params.blockId, query: req.valid.query })));
  router.patch('/blocks/:blockId', ...write, validate({ params: id('blockId'), body: S.blockPatchSchema }), async (req, res) => { await apps.updateBlock({ tenantId: t(req), userId: u(req), blockId: req.params.blockId, body: req.valid.body }); res.status(204).end(); });
  router.delete('/blocks/:blockId', ...write, validate({ params: id('blockId') }), async (req, res) => { await apps.deleteBlock({ tenantId: t(req), userId: u(req), blockId: req.params.blockId }); res.status(204).end(); });
  router.post('/blocks/:blockId/move', ...write, validate({ params: id('blockId'), body: S.moveSchema }), async (req, res) => { await apps.moveBlock({ tenantId: t(req), userId: u(req), blockId: req.params.blockId, direction: req.valid.body.direction }); res.status(204).end(); });
  router.put('/blocks/:blockId/fields', ...write, validate({ params: id('blockId'), body: S.blockFieldsSchema }), async (req, res) => { await apps.setBlockFields({ tenantId: t(req), userId: u(req), blockId: req.params.blockId, items: req.valid.body.fields }); res.status(204).end(); });
  router.post('/blocks/:blockId/actions', ...write, validate({ params: id('blockId'), body: S.actionBodySchema }), async (req, res) => res.status(201).json({ action: await apps.addAction({ tenantId: t(req), userId: u(req), blockId: req.params.blockId, body: req.valid.body }) }));
  router.put('/blocks/:blockId/actions-order', ...write, validate({ params: id('blockId'), body: S.actionOrderSchema }), async (req, res) => { await apps.reorderActions({ tenantId: t(req), userId: u(req), blockId: req.params.blockId, scope: req.valid.body.scope, ids: req.valid.body.ids }); res.status(204).end(); });
  router.patch('/actions/:actionId', ...write, validate({ params: id('actionId'), body: S.actionPatchSchema }), async (req, res) => res.json({ action: await apps.updateAction({ tenantId: t(req), userId: u(req), actionId: req.params.actionId, body: req.valid.body }) }));
  router.delete('/actions/:actionId', ...write, validate({ params: id('actionId') }), async (req, res) => { await apps.deleteAction({ tenantId: t(req), userId: u(req), actionId: req.params.actionId }); res.status(204).end(); });

  router.get('/:key/assignments', admin, validate({ params: key }), async (req, res) => res.json(await apps.getAssignments(t(req), req.params.key)));
  router.put('/:key/assignments', ...write, validate({ params: key, body: S.assignmentsSchema }), async (req, res) => res.json(await apps.setAssignments({ tenantId: t(req), userId: u(req), key: req.params.key, items: req.valid.body.items })));
  router.post('/:key/routes', ...write, validate({ params: key, body: S.routeBodySchema }), async (req, res) => res.status(201).json({ route: await apps.createRoute({ tenantId: t(req), userId: u(req), key: req.params.key, body: req.valid.body }) }));
  router.get('/:key', validate({ params: key }), async (req, res) => sendCached(req, res, await apps.appBundle({ ...read(req), key: req.params.key })));
  router.patch('/:key', ...write, validate({ params: key, body: S.appPatchSchema }), async (req, res) => res.json({ app: await apps.updateApp({ tenantId: t(req), userId: u(req), key: req.params.key, body: req.valid.body }) }));
  router.delete('/:key', ...write, validate({ params: key }), async (req, res) => { await apps.deleteApp({ tenantId: t(req), userId: u(req), key: req.params.key }); res.status(204).end(); });
  return router;
}
