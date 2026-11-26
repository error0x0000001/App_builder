import { AccessRepository } from './access/access.repository.js';
import { HierarchyRepository } from './access/hierarchy.repository.js';
import { AuditRepository } from './audit/audit.repository.js';
import { AuditLogRepository } from './audit/auditLog.repository.js';
import { PasswordHistoryRepository } from './auth/passwordHistory.repository.js';
import { AuthTokenRepository } from './authTokens/authToken.repository.js';
import { InvitationRepository } from './invitations/invitation.repository.js';
import { RecoveryCodeRepository } from './mfa/recoveryCode.repository.js';
import { OAuthAccountRepository } from './oauth/oauthAccount.repository.js';
import { RateLimitRepository } from './rateLimit/rateLimit.repository.js';
import { SecurityRepository } from './security/security.repository.js';
import { SessionRepository } from './sessions/session.repository.js';
import { UserRepository } from './users/user.repository.js';
import { MembershipRepository } from './tenants/membership.repository.js';
import { TenantRepository } from './tenants/tenant.repository.js';
import { WorkspaceRepository } from './workspaces/workspace.repository.js';
import { ObjectRepository } from './objects/object.repository.js';
import { AppRepository } from './apps/app.repository.js';

/** Builds every repository over one executor (the pool, or a transaction). */
export const createRepositories = (executor) => ({
  users: new UserRepository(executor),
  sessions: new SessionRepository(executor),
  authTokens: new AuthTokenRepository(executor),
  tenants: new TenantRepository(executor),
  memberships: new MembershipRepository(executor),
  workspaces: new WorkspaceRepository(executor),
  objects: new ObjectRepository(executor),
  apps: new AppRepository(executor),
  invitations: new InvitationRepository(executor),
  recoveryCodes: new RecoveryCodeRepository(executor),
  oauthAccounts: new OAuthAccountRepository(executor),
  audit: new AuditRepository(executor), // authentication events (per person)
  auditLog: new AuditLogRepository(executor), // changes made in the product (per tenant)
  rateLimits: new RateLimitRepository(executor),
  passwordHistory: new PasswordHistoryRepository(executor),
  access: new AccessRepository(executor),
  hierarchy: new HierarchyRepository(executor),
  security: new SecurityRepository(executor),
});

/** Unit of work: run(fn) executes fn(repos) inside one DB transaction. */
export class UnitOfWork {
  constructor(db) { this.db = db; }
  run(fn) { return this.db.transaction((tx) => fn(createRepositories(tx))); }
}
