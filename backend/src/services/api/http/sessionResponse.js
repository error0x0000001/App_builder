import { config } from '../../../shared/config.js';

export const REFRESH_COOKIE = 'rt';
const cookieOptions = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'lax', path: '/api/v1/auth' };

/** "Remember me" off => a browser-session cookie (no expiry); on => persists until the session expires. */
export const setSessionCookie = (res, session) =>
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, ...(session.persistent ? { expires: session.refreshExpiresAt } : {}) });

export const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, cookieOptions);

/** The single way any flow hands a session to the browser: refresh token in an httpOnly cookie, access token in the body. */
export function sendSession(res, session, status = 200) {
  setSessionCookie(res, session);
  res.status(status).json({ accessToken: session.accessToken, expiresIn: session.expiresIn });
}
