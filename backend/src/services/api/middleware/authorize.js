import { hasRole } from '@app/shared';
import { ForbiddenError, NotFoundError } from '../../../shared/errors.js';

/**
 * Authoritative tenant check (membership is read from the DB/cache, not trusted from the JWT):
 * loads req.membership for the resolved tenant and enforces a minimum role.
 */
const guard = (memberships, minimumRole, tenantIdOf) => async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const membership = tenantId && (await memberships.find(tenantId, req.auth.userId));
    if (!membership) throw new NotFoundError('Tenant not found'); // don't reveal tenants the caller can't see
    if (!hasRole(membership.role, minimumRole)) throw new ForbiddenError();
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

/** Tenant named in the URL (:tenantId). */
export const requireTenantRole = (memberships, minimumRole = 'viewer') => guard(memberships, minimumRole, (req) => req.params.tenantId);
/** Tenant the session is currently working in (access token claim, re-verified against membership). */
export const requireActiveTenantRole = (memberships, minimumRole = 'admin') => guard(memberships, minimumRole, (req) => req.auth.tenantId);
