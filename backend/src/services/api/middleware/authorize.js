import { hasRole } from '@app/shared';
import { ForbiddenError, NotFoundError } from '../../../shared/errors.js';

/**
 * Authoritative workspace check (membership is read from the DB, not trusted from the JWT):
 * loads req.membership for :workspaceId and enforces a minimum role.
 */
export const requireWorkspaceRole = (memberships, minimumRole = 'viewer') => async (req, res, next) => {
  try {
    const membership = await memberships.find(req.params.workspaceId, req.auth.userId);
    if (!membership) throw new NotFoundError('Workspace not found'); // don't reveal workspaces the caller can't see
    if (!hasRole(membership.role, minimumRole)) throw new ForbiddenError();
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};
