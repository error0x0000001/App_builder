import { Router } from 'express';
import { z } from 'zod';
import { bulkInviteSchema, changeRoleSchema, createTenantSchema, onboardingSchema, pageQuerySchema, tenantThemeSchema, uiSettingsPatchSchema, uuidField, tenantLookupSchema } from '@app/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenantRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const tenantParam = z.object({ tenantId: uuidField });
const memberParams = tenantParam.extend({ userId: uuidField });
const invitationParams = tenantParam.extend({ invitationId: uuidField });

export function tenantRoutes({ tenants, invitations, sessions, tokens, repos, rateLimit }) {
  const router = Router();
  const member = (minimumRole) => [validate({ params: tenantParam }), requireTenantRole(repos.memberships, minimumRole)];

  // Public: powers "sign in to your organisation" by URL.
  router.get('/lookup', rateLimit.ip('lookup', 30, 15 * 60), validate({ query: tenantLookupSchema }), async (req, res) => {
    res.json(await tenants.lookupBySlug(req.valid.query.tenant));
  });

  router.use(authenticate(tokens));

  router.get('/', async (req, res) => res.json({ tenants: await tenants.listForUser(req.auth.userId) }));
  router.post('/', rateLimit.ip('create-tenant', 10, 3600), validate({ body: createTenantSchema }), async (req, res) => {
    res.status(201).json({ tenant: await tenants.create(req.auth.userId, req.valid.body) });
  });

  router.post('/:tenantId/switch', ...member('viewer'), async (req, res) => {
    res.json(await sessions.switchTenant({ sessionId: req.auth.sessionId, userId: req.auth.userId, tenantId: req.params.tenantId }));
  });

  router.patch('/:tenantId/onboarding', ...member('admin'), validate({ body: onboardingSchema }), async (req, res) => {
    res.json({ tenant: await tenants.completeOnboarding(req.params.tenantId, req.valid.body) });
  });

  router.patch('/:tenantId/theme', ...member('admin'), validate({ body: tenantThemeSchema }), async (req, res) => {
    res.json({ tenant: await tenants.updateTheme(req.params.tenantId, req.valid.body.theme) });
  });

  // Customize sheet: only the organisation owner changes how the whole tenant looks.
  router.patch('/:tenantId/ui', ...member('owner'), validate({ body: uiSettingsPatchSchema }), async (req, res) => {
    const tenant = await tenants.updateUiSettings(req.params.tenantId, req.valid.body);
    res.json({ tenant: { id: tenant.id, uiSettings: tenant.uiSettings } });
  });

  router.get('/:tenantId/members', ...member('viewer'), validate({ query: pageQuerySchema }), async (req, res) => {
    res.json(await tenants.listMembers(req.params.tenantId, req.valid.query));
  });

  router.patch('/:tenantId/members/:userId', validate({ params: memberParams }), requireTenantRole(repos.memberships, 'admin'), validate({ body: changeRoleSchema }), async (req, res) => {
    await tenants.changeRole({ actor: req.membership, tenantId: req.params.tenantId, targetUserId: req.params.userId, role: req.valid.body.role });
    res.status(204).end();
  });

  router.delete('/:tenantId/members/:userId', validate({ params: memberParams }), requireTenantRole(repos.memberships, 'admin'), async (req, res) => {
    await tenants.removeMember({ actor: req.membership, tenantId: req.params.tenantId, targetUserId: req.params.userId });
    res.status(204).end();
  });

  router.post('/:tenantId/members/:userId/login-as', rateLimit.ip('login-as', 30, 3600), validate({ params: memberParams }), requireTenantRole(repos.memberships, 'admin'), async (req, res) => {
    res.json(await sessions.impersonate({ actor: req.membership, sessionId: req.auth.sessionId, tenantId: req.params.tenantId, targetUserId: req.params.userId, ctx: req.ctx }));
  });

  router.post('/:tenantId/leave', ...member('viewer'), async (req, res) => {
    await tenants.leave({ userId: req.auth.userId, tenantId: req.params.tenantId });
    res.status(204).end();
  });

  router.get('/:tenantId/invitations', ...member('admin'), async (req, res) => res.json({ invitations: await invitations.list(req.params.tenantId) }));

  router.post('/:tenantId/invitations', rateLimit.ip('invite', 60, 3600), ...member('admin'), validate({ body: bulkInviteSchema }), async (req, res) => {
    const results = await invitations.inviteMany({ actor: req.membership, tenantId: req.params.tenantId, invitations: req.valid.body.invitations });
    res.status(201).json({ results });
  });

  router.post('/:tenantId/invitations/:invitationId/resend', rateLimit.ip('invite', 60, 3600), validate({ params: invitationParams }), requireTenantRole(repos.memberships, 'admin'), async (req, res) => {
    await invitations.resend({ actor: req.membership, tenantId: req.params.tenantId, invitationId: req.params.invitationId });
    res.status(204).end();
  });

  router.delete('/:tenantId/invitations/:invitationId', validate({ params: invitationParams }), requireTenantRole(repos.memberships, 'admin'), async (req, res) => {
    await invitations.revoke(req.params.tenantId, req.params.invitationId);
    res.status(204).end();
  });

  return router;
}
