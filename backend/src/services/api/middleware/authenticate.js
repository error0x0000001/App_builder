import { UnauthorizedError } from '../../../shared/errors.js';

const bearer = (req) => req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];

/** Stateless: verifies the access-token signature only — no database round trip per request. */
export const authenticate = (tokens, { optional = false } = {}) => async (req, res, next) => {
  const token = bearer(req);
  if (!token) return next(optional ? undefined : new UnauthorizedError());
  try {
    req.auth = await tokens.verifyAccess(token);
    next();
  } catch (error) {
    next(optional ? undefined : error);
  }
};
