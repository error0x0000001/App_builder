import express, { Router } from 'express';
import { z } from 'zod';
import { TooManyRequestsError, ValidationError } from '../../../shared/errors.js';
import { validate } from '../middleware/validate.js';

const params = z.object({ workspaceId: z.string().uuid(), token: z.string().max(64).optional() });
const SUBMISSIONS_PER_MINUTE = 20;

/** Unauthenticated intake (forms on customers' websites, inbound-email webhook). Throttled per IP and per workspace. */
export function publicRoutes({ intake, cache }) {
  const router = Router();
  router.use(express.urlencoded({ extended: false, limit: '64kb' }));

  router.use((req, res, next) => {
    const limited = !cache.allow(`public:${req.ctx.ip}`, 60, SUBMISSIONS_PER_MINUTE) || !cache.allow(`public-ws:${req.params?.workspaceId ?? req.path}`, 60, 600);
    next(limited ? new TooManyRequestsError(60) : undefined);
  });

  const handle = (kind) => async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    if (!Object.keys(payload).length) throw new ValidationError(undefined, 'No fields submitted');
    await intake.submit(kind, req.params.workspaceId, payload, { token: req.params.token });
    const back = typeof payload.return_url === 'string' && /^https?:\/\//i.test(payload.return_url) ? payload.return_url : null;
    if (back) return res.redirect(303, back);
    return res.status(201).json({ ok: true });
  };

  router.post('/web-to-lead/:workspaceId', validate({ params }), handle('web-to-lead'));
  router.post('/web-to-case/:workspaceId', validate({ params }), handle('web-to-case'));
  router.post('/email-to-case/:workspaceId/:token', validate({ params }), handle('email-to-case'));
  return router;
}
