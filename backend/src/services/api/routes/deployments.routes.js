import { Router } from 'express';
import { z } from 'zod';
import { domainBodySchema, envBodySchema, environmentBodySchema, jobBodySchema, jobPatchSchema, projectBodySchema, serverBodySchema, serverPatchSchema, serviceCreateSchema, servicePatchSchema, uuidField } from '@app/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveWorkspaceRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const id = z.object({ id: uuidField });
const idJob = id.extend({ jobId: uuidField });
const idDomain = id.extend({ domainId: uuidField });
const logQuery = z.object({ from: z.coerce.number().int().min(0).default(0), tail: z.coerce.number().int().min(10).max(2000).default(300) });
const setupBody = z.object({ acmeEmail: z.string().trim().email().max(200) });

/** Deployments API. Admin-only for now (the app-permission model — view / deploy / servers / secrets / terminal — is the next step). */
export function deploymentsRoutes({ tokens, membershipLookup, deployments, rateLimit }) {
  const router = Router();
  router.use(authenticate(tokens), requireActiveWorkspaceRole(membershipLookup, 'admin'));
  const ctx = (req) => ({ workspaceId: req.auth.workspaceId, userId: req.auth.userId, role: req.membership?.role });
  const ws = (req) => req.auth.workspaceId;

  router.get('/overview', async (req, res) => res.json({ projects: await deployments.listProjects(ws(req)), servers: await deployments.listServers(ws(req)), recent: await deployments.listRecentDeployments(ws(req)) }));

  // servers
  router.get('/servers', async (req, res) => res.json({ servers: await deployments.listServers(ws(req)) }));
  router.post('/servers', validate({ body: serverBodySchema }), async (req, res) => res.status(201).json({ server: await deployments.createServer(ctx(req), req.valid.body) }));
  router.post('/servers/local', async (req, res) => res.status(201).json({ server: await deployments.createLocalServer(ctx(req)) }));
  router.patch('/servers/:id', validate({ params: id, body: serverPatchSchema }), async (req, res) => res.json({ server: await deployments.updateServer(ctx(req), req.params.id, req.valid.body) }));
  router.delete('/servers/:id', validate({ params: id }), async (req, res) => { await deployments.deleteServer(ctx(req), req.params.id); res.status(204).end(); });
  router.post('/servers/:id/test', rateLimit.ip('deploy-server-test', 30, 600), validate({ params: id }), async (req, res) => res.json({ server: await deployments.testServer(ctx(req), req.params.id) }));
  router.post('/servers/:id/setup', rateLimit.ip('deploy-server-setup', 10, 3600), validate({ params: id, body: setupBody }), async (req, res) => res.status(202).json({ deployment: await deployments.setupServer(ctx(req), req.params.id, req.valid.body) }));
  router.get('/servers/:id/stats', validate({ params: id }), async (req, res) => res.json({ stats: await deployments.serverStats(ctx(req), req.params.id) }));

  // projects and environments
  router.get('/projects', async (req, res) => res.json({ projects: await deployments.listProjects(ws(req)) }));
  router.post('/projects', validate({ body: projectBodySchema }), async (req, res) => res.status(201).json({ project: await deployments.createProject(ctx(req), req.valid.body) }));
  router.get('/projects/:id', validate({ params: id }), async (req, res) => res.json({ project: await deployments.getProject(ws(req), req.params.id) }));
  router.delete('/projects/:id', validate({ params: id }), async (req, res) => { await deployments.deleteProject(ctx(req), req.params.id); res.status(204).end(); });
  router.post('/projects/:id/environments', validate({ params: id, body: environmentBodySchema }), async (req, res) => res.status(201).json({ environment: await deployments.createEnvironment(ctx(req), req.params.id, req.valid.body) }));
  router.get('/environments/:id/env', validate({ params: id }), async (req, res) => res.json(await deployments.getEnvironmentEnv(ws(req), req.params.id)));
  router.put('/environments/:id/env', validate({ params: id, body: envBodySchema }), async (req, res) => { await deployments.setEnvironmentEnv(ctx(req), req.params.id, req.valid.body.env); res.status(204).end(); });
  router.delete('/environments/:id', validate({ params: id }), async (req, res) => { await deployments.deleteEnvironment(ctx(req), req.params.id); res.status(204).end(); });
  router.post('/environments/:id/services', validate({ params: id, body: serviceCreateSchema }), async (req, res) => res.status(201).json({ service: await deployments.createService(ctx(req), req.params.id, req.valid.body) }));

  // services
  router.get('/services/:id', validate({ params: id }), async (req, res) => res.json({ service: await deployments.getService(ws(req), req.params.id) }));
  router.patch('/services/:id', validate({ params: id, body: servicePatchSchema }), async (req, res) => res.json({ service: await deployments.updateService(ctx(req), req.params.id, req.valid.body) }));
  router.delete('/services/:id', validate({ params: id }), async (req, res) => res.json(await deployments.deleteService(ctx(req), req.params.id)));
  router.put('/services/:id/env', validate({ params: id, body: envBodySchema }), async (req, res) => { await deployments.setServiceEnv(ctx(req), req.params.id, req.valid.body.env); res.status(204).end(); });
  router.post('/services/:id/secrets', rateLimit.ip('deploy-secrets', 30, 600), validate({ params: id }), async (req, res) => res.json(await deployments.revealSecrets(ctx(req), req.params.id)));
  router.post('/services/:id/deploy', rateLimit.ip('deploy-run', 60, 600), validate({ params: id }), async (req, res) => res.status(202).json({ deployment: await deployments.deploy(ctx(req), req.params.id, {}) }));
  router.post('/services/:id/rollback/:deploymentId', validate({ params: id.extend({ deploymentId: uuidField }) }), async (req, res) => res.status(202).json({ deployment: await deployments.rollback(ctx(req), req.params.id, req.params.deploymentId) }));
  router.post('/services/:id/stop', validate({ params: id }), async (req, res) => res.json({ service: await deployments.stop(ctx(req), req.params.id) }));
  router.post('/services/:id/start', validate({ params: id }), async (req, res) => res.json({ service: await deployments.start(ctx(req), req.params.id) }));
  router.post('/services/:id/refresh', validate({ params: id }), async (req, res) => res.json({ service: await deployments.refreshStatus(ctx(req), req.params.id) }));
  router.get('/services/:id/deployments', validate({ params: id }), async (req, res) => res.json({ deployments: await deployments.listDeployments(ws(req), req.params.id) }));
  router.get('/services/:id/logs', validate({ params: id, query: logQuery }), async (req, res) => res.json(await deployments.serviceLogs(ws(req), req.params.id, req.valid.query.tail)));
  router.get('/services/:id/stats', validate({ params: id }), async (req, res) => res.json({ stats: await deployments.serviceStats(ws(req), req.params.id) }));
  router.post('/services/:id/domains', validate({ params: id, body: domainBodySchema }), async (req, res) => res.status(201).json(await deployments.addDomain(ctx(req), req.params.id, req.valid.body)));
  router.delete('/services/:id/domains/:domainId', validate({ params: idDomain }), async (req, res) => res.json(await deployments.removeDomain(ctx(req), req.params.id, req.params.domainId)));
  router.post('/services/:id/jobs', validate({ params: id, body: jobBodySchema }), async (req, res) => res.status(201).json({ jobs: await deployments.addJob(ctx(req), req.params.id, req.valid.body) }));
  router.patch('/services/:id/jobs/:jobId', validate({ params: idJob, body: jobPatchSchema }), async (req, res) => res.json({ jobs: await deployments.updateJob(ctx(req), req.params.id, req.params.jobId, req.valid.body) }));
  router.delete('/services/:id/jobs/:jobId', validate({ params: idJob }), async (req, res) => res.json({ jobs: await deployments.deleteJob(ctx(req), req.params.id, req.params.jobId) }));
  router.post('/services/:id/jobs/:jobId/run', rateLimit.ip('deploy-job-run', 60, 600), validate({ params: idJob }), async (req, res) => res.status(202).json({ deployment: await deployments.runJob(ctx(req), req.params.id, req.params.jobId) }));

  // deployments
  router.get('/deployments/:id', validate({ params: id, query: logQuery }), async (req, res) => res.json({ deployment: await deployments.getDeployment(ws(req), req.params.id, { from: req.valid.query.from }) }));
  return router;
}
