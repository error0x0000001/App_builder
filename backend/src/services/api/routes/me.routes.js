import { Router } from 'express';
import { z } from 'zod';
import { changePasswordSchema, mfaCodeSchema, mfaDisableSchema, pageQuerySchema, updateProfileSchema, userPreferencesSchema, uuidField } from '@app/shared';
import { NotFoundError } from '../../../shared/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { loadUser } from '../middleware/loadUser.js';
import { blockWhileImpersonating } from '../middleware/blockImpersonation.js';
import { validate } from '../middleware/validate.js';
import { receiveUpload } from '../middleware/upload.js';
import { PHOTO_MAX_BYTES } from '../../../modules/users/photoStore.js';
import { toPublicUser } from '../../../modules/users/userPresenter.js';

const MIN = 60;

/** Everything about the signed-in person: profile, password, sessions, activity and two-factor auth. */
export function meRoutes({ features, users, password, sessions, audit, mfa, tokens, repos, rateLimit, avatars }) {
  const router = Router();
  router.use(authenticate(tokens), blockWhileImpersonating);

  router.get('/', async (req, res) => res.json({ ...(await users.me(req.auth.userId, req.auth.tenantId, req.auth.impersonatedBy)), features }));
  router.patch('/', validate({ body: updateProfileSchema }), async (req, res) => res.json({ user: await users.updateProfile(req.auth.userId, req.valid.body) }));

  router.put('/avatar', async (req, res, next) => {
    try { const { photo } = await receiveUpload(req, ({ stream }) => avatars.set(req.auth.userId, stream), { maxFileBytes: PHOTO_MAX_BYTES }); res.json({ avatar: photo }); } catch (error) { next(error); }
  });
  router.delete('/avatar', async (req, res) => res.json({ avatar: (await avatars.remove(req.auth.userId)).photo }));

  router.patch('/preferences', validate({ body: userPreferencesSchema }), async (req, res) => res.json({ user: await users.updatePreferences(req.auth.userId, req.valid.body) }));

  router.post('/password', rateLimit.ip('change-password', 10, 15 * MIN), validate({ body: changePasswordSchema }), loadUser(repos.users), async (req, res) => {
    await password.change({ user: req.user, sessionId: req.auth.sessionId }, req.valid.body, req.ctx);
    res.status(204).end();
  });

  router.get('/sessions', async (req, res) => {
    const list = await sessions.listActive(req.auth.userId);
    res.json({ sessions: list.map((s) => ({ ...s, current: s.id === req.auth.sessionId })) });
  });

  router.delete('/sessions/:sessionId', validate({ params: z.object({ sessionId: uuidField }) }), async (req, res) => {
    if (!(await sessions.revoke(req.valid.params.sessionId, req.auth.userId))) throw new NotFoundError('Session not found');
    res.status(204).end();
  });

  router.get('/activity', validate({ query: pageQuerySchema }), async (req, res) => res.json(await audit.list(req.auth.userId, req.valid.query)));

  router.get('/mfa', loadUser(repos.users), async (req, res) => {
    res.json({ enabled: req.user.mfaEnabled, recoveryCodesRemaining: req.user.mfaEnabled ? await mfa.recoveryCodesRemaining(req.user.id) : 0 });
  });
  router.post('/mfa/setup', rateLimit.ip('mfa-setup', 10, 15 * MIN), loadUser(repos.users), async (req, res) => res.json(await mfa.beginSetup(req.user)));
  router.post('/mfa/enable', rateLimit.ip('mfa-enable', 10, 15 * MIN), validate({ body: mfaCodeSchema }), loadUser(repos.users), async (req, res) => {
    res.json(await mfa.enable(req.user, req.valid.body.code, { sessionId: req.auth.sessionId, ctx: req.ctx }));
  });
  router.post('/mfa/disable', rateLimit.ip('mfa-disable', 10, 15 * MIN), validate({ body: mfaDisableSchema }), loadUser(repos.users), async (req, res) => {
    await mfa.disable(req.user, req.valid.body, req.ctx);
    res.status(204).end();
  });
  router.post('/mfa/recovery-codes', rateLimit.ip('mfa-codes', 10, 15 * MIN), validate({ body: mfaCodeSchema }), loadUser(repos.users), async (req, res) => {
    res.json(await mfa.regenerateRecoveryCodes(req.user, req.valid.body.code));
  });

  return router;
}
