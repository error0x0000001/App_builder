import { Router } from 'express';
import { z } from 'zod';
import { getAdapterMeta, setupIdsSchema, setupListQuerySchema, setupSettingsBodySchema, settingsPatchSchema, uuidField } from '@app/shared';
import { SETUP_COUNTS, SETUP_TREE, getCollection, getSetupPage, getToolMeta } from '@app/shared/setup-registry';
import { createHash } from 'node:crypto';
import { config } from '../../../shared/config.js';
import { NotFoundError, TooManyRequestsError, ValidationError } from '../../../shared/errors.js';
import { supportedViews } from '../../../modules/setup/records.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveWorkspaceRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const keyParam = z.object({ key: z.string().max(100) });
const recordParam = keyParam.extend({ id: uuidField });
const WRITES_PER_MINUTE = 120;

const etagOf = (body) => `"${createHash('md5').update(body).digest('base64url').slice(0, 16)}"`;

/** Sends a pre-serialised JSON body with ETag / 304 so unchanged data costs no bytes and no JSON work. */
function sendEntry(req, res, { body, etag }, cacheControl = 'private, no-cache') {
  res.set({ ETag: etag, 'Cache-Control': cacheControl, Vary: 'Authorization' });
  if (req.get('if-none-match') === etag) return res.status(304).end();
  return res.type('application/json').send(body);
}

export function setupRoutes({ tokens, membershipLookup, cache, usage, setup }) {
  const router = Router();
  const { settings, records, metrics, health, tools } = setup;

  // Static definitions are serialised once at boot: a request costs a hash lookup.
  const staticBodies = new Map();
  const stat = (id, build) => {
    if (!staticBodies.has(id)) { const body = JSON.stringify(build()); staticBodies.set(id, { body, etag: etagOf(body) }); }
    return staticBodies.get(id);
  };

  router.use(authenticate(tokens), requireActiveWorkspaceRole(membershipLookup, 'admin'));
  router.use(async (req, res, next) => {
    try {
      const ws = req.auth.workspaceId;
      usage.hit(ws);
      if (!cache.allow(`setup:${ws}`, 60, config.SETUP_REQUESTS_PER_MINUTE)) throw new TooManyRequestsError(60);
      if (req.method !== 'GET' && (await cache.hit(`setup-w:${ws}:${req.auth.userId}`, 60)) > WRITES_PER_MINUTE) throw new TooManyRequestsError(60);
      req.setupCtx = { workspaceId: ws, userId: req.auth.userId, actor: req.membership };
      next();
    } catch (error) { next(error); }
  });

  /** Resolves :key to a page; 404 for anything that isn't a Setup page or collection. */
  const resolve = (req, res, next) => {
    const page = getSetupPage(req.params.key);
    const collection = getCollection(req.params.key);
    if (!page && !collection) return next(new NotFoundError('Page not found'));
    req.page = page; req.collection = collection;
    next();
  };
  const need = (cond, message) => (req, res, next) => next(cond(req) ? undefined : new NotFoundError(message));
  const params = validate({ params: keyParam });

  router.get('/tree', (req, res) => sendEntry(req, res, stat('tree', () => ({ tree: SETUP_TREE, counts: SETUP_COUNTS })), 'private, max-age=300'));

  router.get('/pages/:key', params, resolve, (req, res) => {
    const { key } = req.params;
    sendEntry(req, res, stat(`page:${key}`, () => ({
      page: req.page ?? req.collection, adapter: getAdapterMeta(key) ?? null, tool: getToolMeta(key),
      views: req.collection ? supportedViews(req.collection) : [],
    })), 'private, max-age=300');
  });

  router.get('/pages/:key/settings', params, resolve, need((r) => r.page?.kind === 'form', 'Not a settings page'), async (req, res) => {
    sendEntry(req, res, await settings.get(req.setupCtx.workspaceId, req.page));
  });

  router.patch('/pages/:key/settings', params, resolve, need((r) => r.page?.kind === 'form', 'Not a settings page'), validate({ body: setupSettingsBodySchema }), async (req, res) => {
    const parsed = settingsPatchSchema(req.page).safeParse(req.valid.body.values);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    sendEntry(req, res, await settings.update(req.setupCtx.workspaceId, req.page, parsed.data, { userId: req.auth.userId, expectedVersion: req.valid.body.version }));
  });

  const collectionOnly = need((r) => r.collection, 'Not a list page');
  router.get('/pages/:key/records', params, resolve, collectionOnly, validate({ query: setupListQuerySchema }), async (req, res) => {
    sendEntry(req, res, await records.list(req.setupCtx, req.collection, req.valid.query));
  });
  router.post('/pages/:key/records', params, resolve, collectionOnly, async (req, res) => {
    res.status(201).json({ record: await records.create(req.setupCtx, req.collection, req.body) });
  });
  router.patch('/pages/:key/records/:id', validate({ params: recordParam }), resolve, collectionOnly, async (req, res) => {
    res.json({ record: await records.update(req.setupCtx, req.collection, req.params.id, req.body) });
  });
  router.post('/pages/:key/records/delete', params, resolve, collectionOnly, validate({ body: setupIdsSchema }), async (req, res) => {
    res.json({ removed: await records.remove(req.setupCtx, req.collection, req.valid.body.ids) });
  });

  router.get('/pages/:key/tree', params, resolve, need((r) => r.page?.kind === 'tree', 'Not a hierarchy page'), async (req, res) => {
    sendEntry(req, res, await records.tree(req.setupCtx, req.collection));
  });

  router.get('/pages/:key/metrics', params, resolve, async (req, res) => {
    const { key } = req.params; const ws = req.setupCtx.workspaceId;
    if (metrics.hasProvider(key)) return sendEntry(req, res, await metrics.dashboard(ws, key));
    if (req.page?.special === 'sysoverview') return sendEntry(req, res, await metrics.overview(ws));
    if (req.page?.special === 'health') return res.json(await health.evaluate(ws));
    throw new NotFoundError('No metrics for this page');
  });

  router.post('/pages/:key/fix', params, resolve, need((r) => r.page?.special === 'health', 'Not the health check'), async (req, res) => {
    res.json(await health.fix(req.setupCtx));
  });

  router.post('/pages/:key/run', params, resolve, need((r) => r.page?.kind === 'info', 'Not a tool page'), async (req, res) => {
    res.json(await tools.run(req.setupCtx, req.page, req.body));
  });

  router.get('/pages/:key/export', params, resolve, need((r) => r.page?.kind === 'info' && getToolMeta(r.page.key)?.download, 'Not an export tool'), validate({ query: z.object({ object: z.string().max(200) }) }), async (req, res) => {
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${req.valid.query.object.replace(/[^\w .-]/g, '_')}.csv"`, 'Cache-Control': 'no-store' });
    for await (const chunk of tools.exportRows(req.setupCtx, req.valid.query.object)) if (!res.write(chunk)) await new Promise((r) => res.once('drain', r));
    res.end();
  });

  return router;
}
