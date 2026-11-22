import { hasRole } from '@app/shared';
import { ForbiddenError, NotFoundError } from '../../../shared/errors.js';

/**
 * Authoritative workspace check (membership is read from the DB/cache, not trusted from the JWT):
 * loads req.membership for the resolved workspace and enforces a minimum role.
 */
const guard = (memberships, minimumRole, workspaceIdOf) => async (req, res, next) => {
  try {
    const workspaceId = workspaceIdOf(req);
    const membership = workspaceId && (await memberships.find(workspaceId, req.auth.userId));
    if (!membership) throw new NotFoundError('Workspace not found'); // don't reveal workspaces the caller can't see
    if (!hasRole(membership.role, minimumRole)) throw new ForbiddenError();
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

/** Workspace named in the URL (:workspaceId). */
export const requireWorkspaceRole = (memberships, minimumRole = 'viewer') => guard(memberships, minimumRole, (req) => req.params.workspaceId);
/** Workspace the session is currently working in (access token claim, re-verified against membership). */
export const requireActiveWorkspaceRole = (memberships, minimumRole = 'admin') => guard(memberships, minimumRole, (req) => req.auth.workspaceId);
