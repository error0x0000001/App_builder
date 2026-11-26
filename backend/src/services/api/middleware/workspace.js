import { UnauthorizedError } from '../../../shared/errors.js';

/**
 * The workspace a request works in: the one in the access token, verified against the person's current assignment (one primary-key lookup).
 * When it is no longer valid (unassigned, archived) the client is told its session needs refreshing, which re-resolves the workspace.
 */
export const requireWorkspace = (workspaces) => async (req, res, next) => {
  try {
    const id = req.auth.workspaceId;
    if (!id || !(await workspaces.isActiveFor(req.auth.tenantId, id, req.auth.userId))) throw new UnauthorizedError('Session expired');
    req.workspaceId = id;
    next();
  } catch (error) { next(error); }
};
