import { Router } from 'express';
import { emailOnlySchema, loginSchema, mfaChallengeSchema, resetPasswordSchema, signupSchema, verifyEmailSchema } from '@app/shared';
import { googleEnabled, config } from '../../../shared/config.js';
import { UnauthorizedError } from '../../../shared/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { blockWhileImpersonating } from '../middleware/blockImpersonation.js';
import { validate } from '../middleware/validate.js';
import { REFRESH_COOKIE, clearRefreshCookie, sendSession, setSessionCookie } from '../http/sessionResponse.js';

const MIN = 60;
const HOUR = 3600;
const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_OPTIONS = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'lax', path: '/api/v1/auth/oauth' };

export function authRoutes({ auth, password, oauth, tokens, rateLimit, sessions }) {
  const router = Router();
  const accepted = (res) => res.status(202).json({ ok: true });

  router.get('/config', (req, res) => res.json({ oauth: { google: googleEnabled } }));

  router.post('/signup', rateLimit.ip('signup', 10, HOUR), validate({ body: signupSchema }), async (req, res) => {
    await auth.signup(req.valid.body, req.ctx);
    accepted(res);
  });

  router.post('/verify-email', rateLimit.ip('verify', 30, 15 * MIN), validate({ body: verifyEmailSchema }), rateLimit.email('verify', 10, 15 * MIN), async (req, res) => {
    sendSession(res, await auth.verifyEmail(req.valid.body, req.ctx));
  });

  router.post('/resend-verification', rateLimit.ip('resend', 10, HOUR), validate({ body: emailOnlySchema }), rateLimit.email('resend', 3, 10 * MIN), async (req, res) => {
    await auth.resendVerification(req.valid.body);
    accepted(res);
  });

  router.post('/login', rateLimit.ip('login', 40, 15 * MIN), validate({ body: loginSchema }), rateLimit.email('login', 10, 15 * MIN), async (req, res) => {
    const result = await auth.login(req.valid.body, req.ctx);
    if (result.mfaRequired) return res.json({ mfaRequired: true, mfaToken: result.mfaToken });
    sendSession(res, result.session);
  });

  router.post('/mfa/challenge', rateLimit.ip('mfa', 30, 15 * MIN), validate({ body: mfaChallengeSchema }), async (req, res) => {
    sendSession(res, await auth.completeMfaLogin(req.valid.body, req.ctx));
  });

  router.post('/refresh', rateLimit.ip('refresh', 300, 15 * MIN), async (req, res) => {
    try {
      sendSession(res, await sessions.refresh(req.cookies[REFRESH_COOKIE], req.ctx));
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  });

  router.post('/logout', authenticate(tokens), async (req, res) => {
    await auth.logout(req.auth, req.ctx);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.post('/logout-all', authenticate(tokens), blockWhileImpersonating, async (req, res) => {
    await auth.logoutAll(req.auth.userId, req.ctx);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.post('/password/forgot', rateLimit.ip('forgot', 10, HOUR), validate({ body: emailOnlySchema }), rateLimit.email('forgot', 3, HOUR), async (req, res) => {
    await password.forgot(req.valid.body, req.ctx);
    accepted(res);
  });

  router.post('/password/reset', rateLimit.ip('reset', 20, HOUR), validate({ body: resetPasswordSchema }), async (req, res) => {
    await password.reset(req.valid.body, req.ctx);
    res.status(204).end();
  });

  if (oauth) {
    router.get('/oauth/google', rateLimit.ip('oauth', 30, 15 * MIN), async (req, res) => {
      const { url, stateToken } = await oauth.authorizationUrl();
      res.cookie(STATE_COOKIE, stateToken, { ...STATE_COOKIE_OPTIONS, maxAge: 10 * MIN * 1000 });
      res.redirect(url);
    });

    router.get('/oauth/google/callback', rateLimit.ip('oauth', 30, 15 * MIN), async (req, res) => {
      res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS);
      try {
        const result = await oauth.handleCallback({ code: req.query.code, state: req.query.state, stateToken: req.cookies[STATE_COOKIE] }, req.ctx);
        if (result.mfaToken) return res.redirect(`${config.APP_URL}/login/mfa#mfa=${encodeURIComponent(result.mfaToken)}`);
        setSessionCookie(res, result.session);
        res.redirect(`${config.APP_URL}/auth/callback`);
      } catch (error) {
        if (!(error instanceof UnauthorizedError)) throw error;
        res.redirect(`${config.APP_URL}/login?error=oauth`);
      }
    });
  }

  return router;
}
