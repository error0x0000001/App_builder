import { config, googleEnabled } from '../../shared/config.js';
import { db, readDb } from '../../shared/db/index.js';
import { logger } from '../../shared/logger.js';
import { PasswordHasher } from '../../shared/security/passwordHasher.js';
import { SecretBox } from '../../shared/security/crypto.js';
import { TokenService } from '../../shared/security/tokenService.js';
import { TotpService } from '../../shared/security/totp.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { AuthService } from '../../modules/auth/auth.service.js';
import { PasswordService } from '../../modules/auth/password.service.js';
import { OneTimeTokenService } from '../../modules/authTokens/oneTimeToken.service.js';
import { InvitationService } from '../../modules/invitations/invitation.service.js';
import { MailService } from '../../modules/mail/mail.service.js';
import { MfaService } from '../../modules/mfa/mfa.service.js';
import { OAuthService } from '../../modules/oauth/oauth.service.js';
import { SessionService } from '../../modules/sessions/session.service.js';
import { UserService } from '../../modules/users/user.service.js';
import { WorkspaceService } from '../../modules/workspaces/workspace.service.js';
import { UnitOfWork, createRepositories } from '../../modules/repositories.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import { createCache } from '../../shared/cache/redis.js';
import { UsageMeter } from '../../shared/cache/usageMeter.js';
import { MembershipLookup } from '../../modules/workspaces/membership.lookup.js';
import { SettingsBindings } from '../../modules/setup/bindings.js';
import { createSetupAdapters } from '../../modules/setup/adapters.js';
import { HealthService } from '../../modules/setup/health.service.js';
import { MetricsService } from '../../modules/setup/metrics.service.js';
import { RecordsService } from '../../modules/setup/records.service.js';
import { SecurityPolicyService } from '../../modules/setup/securityPolicy.service.js';
import { SettingsService } from '../../modules/setup/settings.service.js';
import { ToolsService } from '../../modules/setup/tools.service.js';

const MINUTE_MS = 60_000;

/** Composition root: the only place concrete classes are wired together (dependency inversion). */
export function createContainer({ boss }) {
  const repos = createRepositories(db);
  const uow = new UnitOfWork(db);
  const cache = createCache();
  const usage = new UsageMeter({ redis: cache.redis });
  const membershipLookup = new MembershipLookup({ repos, cache });
  const setupSettings = new SettingsService({ repos, cache, bindings: new SettingsBindings({ repos, usage, appHost: new URL(config.APP_URL).host }) });
  const securityPolicy = new SecurityPolicyService({ repos, settings: setupSettings, cache, defaults: { maxAttempts: config.MAX_FAILED_LOGINS, lockMs: config.LOCKOUT_MINUTES * MINUTE_MS } });
  const hasher = new PasswordHasher();
  const tokens = new TokenService({ secret: config.JWT_SECRET, accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS });
  const secretBox = new SecretBox(config.ENCRYPTION_KEY);
  const totp = new TotpService({ issuer: 'Cloudbase' });
  const mail = new MailService({ boss });
  const audit = new AuditService({ repos, logger });
  const oneTime = new OneTimeTokenService({ repos, pepper: config.JWT_SECRET });
  const sessions = new SessionService({
    securityPolicy, repos, tokens, audit, refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS, accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  });
  const workspaces = new WorkspaceService({ repos, uow, sessions, membershipLookup });
  const password = new PasswordService({ repos, hasher, oneTime, sessions, mail, audit, securityPolicy, resetTtlMs: config.PASSWORD_RESET_TTL_MINUTES * MINUTE_MS });
  const mfa = new MfaService({ repos, uow, totp, secretBox, hasher, sessions, audit, mail, pepper: config.JWT_SECRET });
  const auth = new AuthService({
    repos, uow, hasher, tokens, sessions, oneTime, mail, audit, mfa, workspaces, password, securityPolicy,
    policy: {
      maxAttempts: config.MAX_FAILED_LOGINS,
      lockMs: config.LOCKOUT_MINUTES * MINUTE_MS,
      verificationTtlMs: config.VERIFICATION_CODE_TTL_MINUTES * MINUTE_MS,
    },
  });
  const invitations = new InvitationService({ repos, uow, hasher, sessions, mail, audit, securityPolicy, ttlDays: config.INVITATION_TTL_DAYS });
  const users = new UserService({ repos });
  const oauth = googleEnabled
    ? new OAuthService({
      repos, uow, tokens, auth, workspaces, audit, mfaTokens: tokens,
      settings: { appUrl: config.APP_URL, clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET },
    })
    : null;

  const setupRecords = new RecordsService({ repos, uow, cache, adapters: createSetupAdapters({ db, workspaces, invitations, sessions, repos }) });
  const health = new HealthService({ settings: setupSettings });
  const setup = {
    settings: setupSettings, records: setupRecords, health,
    metrics: new MetricsService({ repos, db: readDb, cache, usage, health }),
    tools: new ToolsService({ repos, records: setupRecords, mail, boss }),
  };
  const close = async () => { usage.stop(); await usage.flush().catch(() => {}); await cache.close?.(); };

  return { securityPolicy, cache, usage, membershipLookup, setup, close, repos, tokens, rateLimit: createRateLimiters(repos.rateLimits), auth, password, mfa, sessions, workspaces, invitations, users, audit, oauth };
}
