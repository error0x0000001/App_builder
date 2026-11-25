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
import { TenantService } from '../../modules/tenants/tenant.service.js';
import { UnitOfWork, createRepositories } from '../../modules/repositories.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import { createCache } from '../../shared/cache/redis.js';
import { UsageMeter } from '../../shared/cache/usageMeter.js';
import { MembershipLookup } from '../../modules/tenants/membership.lookup.js';
import { SettingsBindings } from '../../modules/setup/bindings.js';
import { createSetupAdapters } from '../../modules/setup/adapters.js';
import { HealthService } from '../../modules/setup/health.service.js';
import { MetricsService } from '../../modules/setup/metrics.service.js';
import { UserDetailsService } from '../../modules/setup/userDetails.service.js';
import { RecordsService } from '../../modules/setup/records.service.js';
import { AccessService } from '../../modules/access/access.service.js';
import { createAccessAddons } from '../../modules/access/addons.service.js';
import { IntegrationsService } from '../../modules/integrations/integrations.service.js';
import { ChannelNotifier } from '../../modules/integrations/channelNotifier.js';
import { createDeployments, createTerminals } from '../../modules/deployments/index.js';
import { SearchService } from '../../modules/search/search.service.js';
import { SecurityPolicyService } from '../../modules/security/securityPolicy.service.js';
import { createAccessLists } from '../../modules/setup/accessLists.js';
import { SettingsService } from '../../modules/setup/settings.service.js';
import { ToolsService } from '../../modules/setup/tools.service.js';
import { DriveService } from '../../modules/drive/drive.service.js';
import { PhotoStore } from '../../modules/users/photoStore.js';
import { PeopleService } from '../../modules/users/people.service.js';
import { LinkPreviewService } from '../../modules/chat/linkPreview.service.js';
import { CallService } from '../../modules/chat/call.service.js';
import { LiveKitClient } from '../../shared/livekit.js';
import { ChatService } from '../../modules/chat/chat.service.js';
import { createBus } from '../../modules/chat/bus.js';
import { PresenceStore } from '../../modules/chat/presence.js';
import { RealtimeHub } from '../../modules/chat/hub.js';
import { LocalStorageDriver } from '../../shared/storage/localStorage.js';

const MINUTE_MS = 60_000;

/** Composition root: the only place concrete classes are wired together (dependency inversion). */
export function createContainer({ boss }) {
  const repos = createRepositories(db);
  const uow = new UnitOfWork(db);
  const cache = createCache();
  const usage = new UsageMeter({ redis: cache.redis });
  const membershipLookup = new MembershipLookup({ repos, cache });
  const securityPolicy = new SecurityPolicyService({ repos, cache, defaults: { maxAttempts: config.MAX_FAILED_LOGINS, lockMs: config.LOCKOUT_MINUTES * MINUTE_MS } });
  const setupSettings = new SettingsService({ repos, cache, onSecurityChange: (tenantId) => securityPolicy.changed(tenantId), bindings: new SettingsBindings({ repos, usage, appHost: new URL(config.APP_URL).host }) });
  const hasher = new PasswordHasher();
  const tokens = new TokenService({ secret: config.JWT_SECRET, accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS });
  const secretBox = new SecretBox(config.ENCRYPTION_KEY);
  const totp = new TotpService({ issuer: 'Quelli' });
  const mail = new MailService({ boss });
  const audit = new AuditService({ repos, logger });
  const oneTime = new OneTimeTokenService({ repos, pepper: config.JWT_SECRET });
  const workspaces = new WorkspaceService({ repos, uow });
  const sessions = new SessionService({
    securityPolicy, workspaces, repos, tokens, audit, refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS, accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  });
  const tenants = new TenantService({ repos, uow, sessions, membershipLookup, workspaces });
  const password = new PasswordService({ repos, hasher, oneTime, sessions, mail, audit, securityPolicy, resetTtlMs: config.PASSWORD_RESET_TTL_MINUTES * MINUTE_MS });
  const mfa = new MfaService({ repos, uow, totp, secretBox, hasher, sessions, audit, mail, pepper: config.JWT_SECRET });
  const auth = new AuthService({
    repos, uow, hasher, tokens, sessions, oneTime, mail, audit, mfa, tenants, password, securityPolicy,
    policy: {
      maxAttempts: config.MAX_FAILED_LOGINS,
      lockMs: config.LOCKOUT_MINUTES * MINUTE_MS,
      verificationTtlMs: config.VERIFICATION_CODE_TTL_MINUTES * MINUTE_MS,
    },
  });
  const invitations = new InvitationService({ repos, uow, workspaces, hasher, sessions, mail, audit, securityPolicy, ttlDays: config.INVITATION_TTL_DAYS });
  const users = new UserService({ repos, cache });
  const oauth = googleEnabled
    ? new OAuthService({
      repos, uow, tokens, auth, tenants, audit, mfaTokens: tokens,
      settings: { appUrl: config.APP_URL, clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET },
    })
    : null;

  const health = new HealthService({ settings: setupSettings });
  const integrations = new IntegrationsService({ db, secretBox, repos, allowPrivate: config.INTEGRATIONS_ALLOW_PRIVATE_HOSTS });
  const notifier = new ChannelNotifier({ boss, integrations, logger });
  const addons = createAccessAddons({ enabled: config.ACCESS_ADDONS_ENABLED, db, repos, changed: (tenantId) => access.changed(tenantId) }); // null when ACCESS_ADDONS_ENABLED=false: the feature never runs
  const access = new AccessService({ repos, cache, addons });
  const setupRecords = new RecordsService({ cache, adapters: { ...createSetupAdapters({ db, tenants, invitations, sessions, repos, access, addonsEnabled: Boolean(addons) }), ...createAccessLists({ repos, cache, access, security: securityPolicy, addons }) } });
  const drive = new DriveService({
    db, storage: new LocalStorageDriver(config.STORAGE_DIR), cache, secret: config.JWT_SECRET,
    limits: { maxUploadBytes: config.MAX_UPLOAD_MB * 1024 * 1024, quotaBytes: config.DRIVE_QUOTA_MB * 1024 * 1024 },
  });
  const avatars = new PhotoStore({ db, storage: drive.storage, kind: 'avatars', table: 'users', column: 'avatar_version', touchUpdatedAt: true });
  const icons = new PhotoStore({ db, storage: drive.storage, kind: 'chat-icons', table: 'chat_conversations', column: 'icon_version' });
  const people = new PeopleService({ db: readDb });
  const bus = createBus(config.REDIS_URL);
  const presence = new PresenceStore({ redis: cache.redis });
  const chat = new ChatService({ db, bus, cache, users, drive });
  const linkPreviews = new LinkPreviewService({ db, cache });
  const calls = new CallService({ db, chat, livekit: new LiveKitClient({ url: config.LIVEKIT_URL, apiKey: config.LIVEKIT_API_KEY, apiSecret: config.LIVEKIT_API_SECRET }) });
  const realtime = new RealtimeHub({ tokens, chat, bus, presence, logger }).start();
  const search = new SearchService({ db: readDb, cache, drive });
  const setup = {
    settings: setupSettings, records: setupRecords, health,
    metrics: new MetricsService({ repos, db: readDb, cache, usage, health }),
    userDetails: new UserDetailsService({ db, repos, cache, addons }),
    addons,
    tools: new ToolsService({ repos, mail, boss }),
  };
  const close = async () => { await terminals?.close(); await realtime.close(); await bus.close(); usage.stop(); await usage.flush().catch(() => {}); await cache.close?.(); };

  const deployments = createDeployments({ enabled: config.DEPLOYMENTS_ENABLED, db, secretBox, repos, integrations, notifier, boss, logger });
  const terminals = createTerminals({ deployments, tokens, membershipLookup, logger });
  const features = Object.freeze({ accessAddons: Boolean(addons), deployments: Boolean(deployments) });
  return { deployments, terminals, integrations, features, linkPreviews, avatars, icons, people, chat, calls, presence, realtime, search, drive, users, access, securityPolicy, workspaces, cache, usage, membershipLookup, setup, close, repos, tokens, rateLimit: createRateLimiters(repos.rateLimits), auth, password, mfa, sessions, tenants, invitations, users, audit, oauth };
}
