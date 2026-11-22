import { Router } from 'express';
import { z } from 'zod';
import { bulkInviteSchema, changeRoleSchema, createWorkspaceSchema, onboardingSchema, pageQuerySchema, tenantThemeSchema, uuidField, workspaceLookupSchema } from '@app/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireWorkspaceRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const workspaceParam = z.object({ workspaceId: uuidField });
const memberParams = workspaceParam.extend({ userId: uuidField });
const invitationParams = workspaceParam.extend({ invitationId: uuidField });

export function workspaceRoutes({ workspaces, invitations, sessions, tokens, repos, rateLimit }) {
  const router = Router();
  const member = (minimumRole) => [validate({ params: workspaceParam }), requireWorkspaceRole(repos.memberships, minimumRole)];

  // Public: powers "sign in to your workspace" by URL.
  router.get('/lookup', rateLimit.ip('lookup', 30, 15 * 60), validate({ query: workspaceLookupSchema }), async (req, res) => {
    res.json(await workspaces.lookupBySlug(req.valid.query.workspace));
  });

  router.use(authenticate(tokens));

  router.get('/', async (req, res) => res.json({ workspaces: await workspaces.listForUser(req.auth.userId) }));
  router.post('/', rateLimit.ip('create-workspace', 10, 3600), validate({ body: createWorkspaceSchema }), async (req, res) => {
    res.status(201).json({ workspace: await workspaces.create(req.auth.userId, req.valid.body) });
  });

  router.post('/:workspaceId/switch', ...member('viewer'), async (req, res) => {
    res.json(await sessions.switchWorkspace({ sessionId: req.auth.sessionId, userId: req.auth.userId, workspaceId: req.params.workspaceId }));
  });

  router.patch('/:workspaceId/onboarding', ...member('admin'), validate({ body: onboardingSchema }), async (req, res) => {
    res.json({ workspace: await workspaces.completeOnboarding(req.params.workspaceId, req.valid.body) });
  });

  router.patch('/:workspaceId/theme', ...member('admin'), validate({ body: tenantThemeSchema }), async (req, res) => {
    res.json({ workspace: await workspaces.updateTheme(req.params.workspaceId, req.valid.body.theme) });
  });

  router.get('/:workspaceId/members', ...member('viewer'), validate({ query: pageQuerySchema }), async (req, res) => {
    res.json(await workspaces.listMembers(req.params.workspaceId, req.valid.query));
  });

  router.patch('/:workspaceId/members/:userId', validate({ params: memberParams }), requireWorkspaceRole(repos.memberships, 'admin'), validate({ body: changeRoleSchema }), async (req, res) => {
    await workspaces.changeRole({ actor: req.membership, workspaceId: req.params.workspaceId, targetUserId: req.params.userId, role: req.valid.body.role });
    res.status(204).end();
  });

  router.delete('/:workspaceId/members/:userId', validate({ params: memberParams }), requireWorkspaceRole(repos.memberships, 'admin'), async (req, res) => {
    await workspaces.removeMember({ actor: req.membership, workspaceId: req.params.workspaceId, targetUserId: req.params.userId });
    res.status(204).end();
  });

  router.post('/:workspaceId/members/:userId/login-as', rateLimit.ip('login-as', 30, 3600), validate({ params: memberParams }), requireWorkspaceRole(repos.memberships, 'admin'), async (req, res) => {
    res.json(await sessions.impersonate({ actor: req.membership, sessionId: req.auth.sessionId, workspaceId: req.params.workspaceId, targetUserId: req.params.userId, ctx: req.ctx }));
  });

  router.post('/:workspaceId/leave', ...member('viewer'), async (req, res) => {
    await workspaces.leave({ userId: req.auth.userId, workspaceId: req.params.workspaceId });
    res.status(204).end();
  });

  router.get('/:workspaceId/invitations', ...member('admin'), async (req, res) => res.json({ invitations: await invitations.list(req.params.workspaceId) }));

  router.post('/:workspaceId/invitations', rateLimit.ip('invite', 60, 3600), ...member('admin'), validate({ body: bulkInviteSchema }), async (req, res) => {
    const results = await invitations.inviteMany({ actor: req.membership, workspaceId: req.params.workspaceId, invitations: req.valid.body.invitations });
    res.status(201).json({ results });
  });

  router.post('/:workspaceId/invitations/:invitationId/resend', rateLimit.ip('invite', 60, 3600), validate({ params: invitationParams }), requireWorkspaceRole(repos.memberships, 'admin'), async (req, res) => {
    await invitations.resend({ actor: req.membership, workspaceId: req.params.workspaceId, invitationId: req.params.invitationId });
    res.status(204).end();
  });

  router.delete('/:workspaceId/invitations/:invitationId', validate({ params: invitationParams }), requireWorkspaceRole(repos.memberships, 'admin'), async (req, res) => {
    await invitations.revoke(req.params.workspaceId, req.params.invitationId);
    res.status(204).end();
  });

  return router;
}
