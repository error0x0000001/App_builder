import { Router } from 'express';
import { z } from 'zod';
import { accessBodySchema, hasAccess, domainBodySchema, envBodySchema, environmentBodySchema, jobBodySchema, jobPatchSchema, projectBodySchema, serverBodySchema, serverPatchSchema, serviceCreateSchema, servicePatchSchema, uuidField } from '@app/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveWorkspaceRole } from '../middleware/authorize.js';
import { ForbiddenError } from '../../../shared/errors.js';
import { validate } from '../middleware/validate.js';

const id = z.object({ id: uuidField });
const idJob = id.extend({ jobId: uuidField });
const idDomain = id.extend({ domainId: uuidField });
const logQuery = z.object({ from: z.coerce.number().int().min(0).default(0), tail: z.coerce.number().int().min(10).max(2000).default(300) });
const setupBody = z.object({ acmeEmail: z.string().trim().email().max(200) });

/** Deployments API. Levels: viewer (read, logs, stats) < deployer (deploy, roll back, stop/start, run schedules) < manager (servers, secrets, config, access). Owners and admins are managers. */
export function deploymentsRoutes({ tokens, membershipLookup, deployments, rateLimit }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveWorkspaceRole(membershipLookup, 'viewer'));
  const ctx = (req) => ({ workspaceId: req.auth.workspaceId, userId: req.auth.userId, role: req.membership?.role });
  const ws = (req) => req.auth.workspaceId;
  /** Checked on every route: the person's level must be at least `level`. */
  const need = (level) => async (req, res, next) => {
    try { req.dpLevel = await deployments.levelFor(ctx(req)); if (!hasAccess(req.dpLevel, level)) throw new ForbiddenError(); next(); } catch (e) { next(e); }
  };

  router.get('/overview', need('viewer'), async (req, res) => res.json({ projects: await deployments.listProjects(ws(req)), servers: await deployments.listServers(ws(req)), recent: await deployments.listRecentDeployments(ws(req)) }));

  // servers
  router.get('/servers', need('viewer'), async (req, res) => res.json({ servers: await deployments.listServers(ws(req)) }));
  router.post('/servers', need('manager'), validate({ body: serverBodySchema }), async (req, res) => res.status(201).json({ server: await deployments.createServer(ctx(req), req.valid.body) }));
  router.post('/servers/local', need('manager'), async (req, res) => res.status(201).json({ server: await deployments.createLocalServer(ctx(req)) }));
  router.patch('/servers/:id', need('manager'), validate({ params: id, body: serverPatchSchema }), async (req, res) => res.json({ server: await deployments.updateServer(ctx(req), req.params.id, req.valid.body) }));
  router.delete('/servers/:id', need('manager'), validate({ params: id }), async (req, res) => { await deployments.deleteServer(ctx(req), req.params.id); res.status(204).end(); });
  router.post('/servers/:id/test', need('manager'), rateLimit.ip('deploy-server-test', 30, 600), validate({ params: id }), async (req, res) => res.json({ server: await deployments.testServer(ctx(req), req.params.id) }));
  router.post('/servers/:id/setup', need('manager'), rateLimit.ip('deploy-server-setup', 10, 3600), validate({ params: id, body: setupBody }), async (req, res) => res.status(202).json({ deployment: await deployments.setupServer(ctx(req), req.params.id, req.valid.body) }));
  router.get('/servers/:id/stats', need('viewer'), validate({ params: id }), async (req, res) => res.json({ stats: await deployments.serverStats(ctx(req), req.params.id) }));

  // projects and environments
  router.get('/projects', need('viewer'), async (req, res) => res.json({ projects: await deployments.listProjects(ws(req)) }));
  router.post('/projects', need('manager'), validate({ body: projectBodySchema }), async (req, res) => res.status(201).json({ project: await deployments.createProject(ctx(req), req.valid.body) }));
  router.get('/projects/:id', need('viewer'), validate({ params: id }), async (req, res) => res.json({ project: await deployments.getProject(ws(req), req.params.id) }));
  router.delete('/projects/:id', need('manager'), validate({ params: id }), async (req, res) => { await deployments.deleteProject(ctx(req), req.params.id); res.status(204).end(); });
  router.post('/projects/:id/environments', need('manager'), validate({ params: id, body: environmentBodySchema }), async (req, res) => res.status(201).json({ environment: await deployments.createEnvironment(ctx(req), req.params.id, req.valid.body) }));
  router.get('/environments/:id/env', need('viewer'), validate({ params: id }), async (req, res) => res.json(await deployments.getEnvironmentEnv(ws(req), req.params.id)));
  router.put('/environments/:id/env', need('manager'), validate({ params: id, body: envBodySchema }), async (req, res) => { await deployments.setEnvironmentEnv(ctx(req), req.params.id, req.valid.body.env); res.status(204).end(); });
  router.delete('/environments/:id', need('manager'), validate({ params: id }), async (req, res) => { await deployments.deleteEnvironment(ctx(req), req.params.id); res.status(204).end(); });
  router.post('/environments/:id/services', need('manager'), validate({ params: id, body: serviceCreateSchema }), async (req, res) => res.status(201).json({ service: await deployments.createService(ctx(req), req.params.id, req.valid.body) }));

  // services
  router.get('/services/:id', need('viewer'), validate({ params: id }), async (req, res) => res.json({ service: await deployments.getService(ws(req), req.params.id) }));
  router.patch('/services/:id', need('manager'), validate({ params: id, body: servicePatchSchema }), async (req, res) => res.json({ service: await deployments.updateService(ctx(req), req.params.id, req.valid.body) }));
  router.delete('/services/:id', need('manager'), validate({ params: id }), async (req, res) => res.json(await deployments.deleteService(ctx(req), req.params.id)));
  router.put('/services/:id/env', need('manager'), validate({ params: id, body: envBodySchema }), async (req, res) => { await deployments.setServiceEnv(ctx(req), req.params.id, req.valid.body.env); res.status(204).end(); });
  router.post('/services/:id/secrets', need('manager'), rateLimit.ip('deploy-secrets', 30, 600), validate({ params: id }), async (req, res) => res.json(await deployments.revealSecrets(ctx(req), req.params.id)));
  router.post('/services/:id/deploy', need('deployer'), rateLimit.ip('deploy-run', 60, 600), validate({ params: id }), async (req, res) => res.status(202).json({ deployment: await deployments.deploy(ctx(req), req.params.id, {}) }));
  router.post('/services/:id/rollback/:deploymentId', need('deployer'), validate({ params: id.extend({ deploymentId: uuidField }) }), async (req, res) => res.status(202).json({ deployment: await deployments.rollback(ctx(req), req.params.id, req.params.deploymentId) }));
  router.post('/services/:id/stop', need('deployer'), validate({ params: id }), async (req, res) => res.json({ service: await deployments.stop(ctx(req), req.params.id) }));
  router.post('/services/:id/start', need('deployer'), validate({ params: id }), async (req, res) => res.json({ service: await deployments.start(ctx(req), req.params.id) }));
  router.post('/services/:id/refresh', need('deployer'), validate({ params: id }), async (req, res) => res.json({ service: await deployments.refreshStatus(ctx(req), req.params.id) }));
  router.get('/services/:id/deployments', need('viewer'), validate({ params: id }), async (req, res) => res.json({ deployments: await deployments.listDeployments(ws(req), req.params.id) }));
  router.get('/services/:id/logs', need('viewer'), validate({ params: id, query: logQuery }), async (req, res) => res.json(await deployments.serviceLogs(ws(req), req.params.id, req.valid.query.tail)));
  router.get('/services/:id/stats', need('viewer'), validate({ params: id }), async (req, res) => res.json({ stats: await deployments.serviceStats(ws(req), req.params.id) }));
  router.post('/services/:id/domains', need('manager'), validate({ params: id, body: domainBodySchema }), async (req, res) => res.status(201).json(await deployments.addDomain(ctx(req), req.params.id, req.valid.body)));
  router.delete('/services/:id/domains/:domainId', need('manager'), validate({ params: idDomain }), async (req, res) => res.json(await deployments.removeDomain(ctx(req), req.params.id, req.params.domainId)));
  router.post('/services/:id/jobs', need('manager'), validate({ params: id, body: jobBodySchema }), async (req, res) => res.status(201).json({ jobs: await deployments.addJob(ctx(req), req.params.id, req.valid.body) }));
  router.patch('/services/:id/jobs/:jobId', need('manager'), validate({ params: idJob, body: jobPatchSchema }), async (req, res) => res.json({ jobs: await deployments.updateJob(ctx(req), req.params.id, req.params.jobId, req.valid.body) }));
  router.delete('/services/:id/jobs/:jobId', need('manager'), validate({ params: idJob }), async (req, res) => res.json({ jobs: await deployments.deleteJob(ctx(req), req.params.id, req.params.jobId) }));
  router.post('/services/:id/jobs/:jobId/run', need('deployer'), rateLimit.ip('deploy-job-run', 60, 600), validate({ params: idJob }), async (req, res) => res.status(202).json({ deployment: await deployments.runJob(ctx(req), req.params.id, req.params.jobId) }));

  router.get('/me', need('viewer'), (req, res) => res.json({ level: req.dpLevel }));
  router.get('/access', need('manager'), async (req, res) => res.json({ access: await deployments.listAccess(ws(req)) }));
  router.put('/access', need('manager'), validate({ body: accessBodySchema }), async (req, res) => res.json({ access: await deployments.setAccess(ctx(req), req.valid.body) }));
  router.delete('/access/:id', need('manager'), validate({ params: id }), async (req, res) => res.json({ access: await deployments.removeAccess(ctx(req), req.params.id) }));
  // deployments
  router.get('/deployments/:id', need('viewer'), validate({ params: id, query: logQuery }), async (req, res) => res.json({ deployment: await deployments.getDeployment(ws(req), req.params.id, { from: req.valid.query.from }) }));
  return router;
}
