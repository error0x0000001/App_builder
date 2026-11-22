import { AuditRepository } from './audit/audit.repository.js';
import { PasswordHistoryRepository } from './auth/passwordHistory.repository.js';
import { AuthTokenRepository } from './authTokens/authToken.repository.js';
import { InvitationRepository } from './invitations/invitation.repository.js';
import { RecoveryCodeRepository } from './mfa/recoveryCode.repository.js';
import { OAuthAccountRepository } from './oauth/oauthAccount.repository.js';
import { RateLimitRepository } from './rateLimit/rateLimit.repository.js';
import { SessionRepository } from './sessions/session.repository.js';
import { RecordsRepository, SettingsRepository, SetupAuditRepository } from './setup/repositories.js';
import { UserRepository } from './users/user.repository.js';
import { MembershipRepository } from './workspaces/membership.repository.js';
import { WorkspaceRepository } from './workspaces/workspace.repository.js';

/** Builds every repository over one executor (the pool, or a transaction). */
export const createRepositories = (executor) => ({
  users: new UserRepository(executor),
  sessions: new SessionRepository(executor),
  authTokens: new AuthTokenRepository(executor),
  workspaces: new WorkspaceRepository(executor),
  memberships: new MembershipRepository(executor),
  invitations: new InvitationRepository(executor),
  recoveryCodes: new RecoveryCodeRepository(executor),
  oauthAccounts: new OAuthAccountRepository(executor),
  audit: new AuditRepository(executor),
  rateLimits: new RateLimitRepository(executor),
  passwordHistory: new PasswordHistoryRepository(executor),
  setupSettings: new SettingsRepository(executor),
  setupRecords: new RecordsRepository(executor),
  setupAudit: new SetupAuditRepository(executor),
});

/** Unit of work: run(fn) executes fn(repos) inside one DB transaction. */
export class UnitOfWork {
  constructor(db) { this.db = db; }
  run(fn) { return this.db.transaction((tx) => fn(createRepositories(tx))); }
}
