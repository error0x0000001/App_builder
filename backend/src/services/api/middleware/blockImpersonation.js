import { ForbiddenError } from '../../../shared/errors.js';

/** While an admin is acting as a member, account-level changes (password, MFA, sessions, sign-out-everywhere) are refused. */
export const blockWhileImpersonating = (req, res, next) =>
  next(req.auth?.impersonatedBy && req.method !== 'GET' ? new ForbiddenError('Not available while signed in as another user', 'IMPERSONATING') : undefined);
