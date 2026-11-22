import { Router } from 'express';
import { z } from 'zod';
import { acceptInviteSchema, tokenField } from '@app/shared';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { sendSession } from '../http/sessionResponse.js';

const HOUR = 3600;

/** Public endpoints for the emailed invitation link. */
export function invitationRoutes({ invitations, tokens, rateLimit }) {
  const router = Router();

  router.get('/preview', rateLimit.ip('invite-preview', 60, HOUR), validate({ query: z.object({ token: tokenField }) }), async (req, res) => {
    res.json(await invitations.preview(req.valid.query.token));
  });

  router.post('/accept', rateLimit.ip('invite-accept', 20, HOUR), authenticate(tokens, { optional: true }), validate({ body: acceptInviteSchema }), async (req, res) => {
    const { token, ...profile } = req.valid.body;
    const result = await invitations.accept({ token, profile, authUserId: req.auth?.userId }, req.ctx);
    if (result.session) return sendSession(res, result.session, 201);
    res.json({ workspaceId: result.workspaceId });
  });

  return router;
}
