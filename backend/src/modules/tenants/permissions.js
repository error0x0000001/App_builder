import { hasRole, outranks } from '@app/shared';
import { ForbiddenError } from '../../shared/errors.js';

/**
 * Member-management policy in one place.
 * - Only admins/owners manage members.
 * - Nobody can touch someone ranked above them; only owners can grant or change ownership.
 */
export function assertCanManageMember({ actorRole, targetRole, newRole }) {
  if (!hasRole(actorRole, 'admin')) throw new ForbiddenError();
  if (!outranks(actorRole, targetRole) || (newRole && !outranks(actorRole, newRole))) throw new ForbiddenError('You cannot manage a member with an equal or higher role');
}
