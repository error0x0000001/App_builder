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
import { UserDetailsService } from '../../modules/setup/userDetails.service.js';
import { RecordsService } from '../../modules/setup/records.service.js';
import { getCollection } from '@app/shared/setup-registry';
import { AccessService } from '../../modules/access/access.service.js';
import { createAccessAddons } from '../../modules/access/addons.service.js';
import { IntegrationsService } from '../../modules/integrations/integrations.service.js';
import { ChannelNotifier } from '../../modules/integrations/channelNotifier.js';
import { createDeployments, createTerminals } from '../../modules/deployments/index.js';
import { SearchService } from '../../modules/search/search.service.js';
import { SecurityPolicyService } from '../../modules/setup/securityPolicy.service.js';
import { EmailPolicyService } from '../../modules/setup/emailPolicy.service.js';
import { EscalationService } from '../../modules/automation/escalation.service.js';
import { SettingsReader } from '../../modules/setup/settingsReader.js';
import { SettingsService } from '../../modules/setup/settings.service.js';
import { AutomationService } from '../../modules/automation/automation.service.js';
import { IntakeService } from '../../modules/automation/intake.service.js';
import { ObjectsService } from '../../modules/objects/objects.service.js';
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
  const intakeUrl = (kind, ws) => (kind === 'email-to-case' ? `${new URL(`/api/v1/public/email-to-case/${ws}/${intake.emailToken(ws)}`, config.APP_URL)}` : `${new URL(`/api/v1/public/${kind}/${ws}`, config.APP_URL)}`);
  const usage = new UsageMeter({ redis: cache.redis });
  const membershipLookup = new MembershipLookup({ repos, cache });
  const setupSettings = new SettingsService({ repos, cache, bindings: new SettingsBindings({ repos, usage, appHost: new URL(config.APP_URL).host, intakeUrl: (kind, ws) => intakeUrl(kind, ws) }) });
  const securityPolicy = new SecurityPolicyService({ repos, settings: setupSettings, cache, defaults: { maxAttempts: config.MAX_FAILED_LOGINS, lockMs: config.LOCKOUT_MINUTES * MINUTE_MS } });
  const hasher = new PasswordHasher();
  const tokens = new TokenService({ secret: config.JWT_SECRET, accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS });
  const secretBox = new SecretBox(config.ENCRYPTION_KEY);
  const totp = new TotpService({ issuer: 'Quelli' });
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
  const users = new UserService({ repos, cache });
  const oauth = googleEnabled
    ? new OAuthService({
      repos, uow, tokens, auth, workspaces, audit, mfaTokens: tokens,
      settings: { appUrl: config.APP_URL, clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET },
    })
    : null;

  const setupRecords = new RecordsService({ repos, uow, cache, adapters: createSetupAdapters({ db, workspaces, invitations, sessions, repos, addonsEnabled: config.ACCESS_ADDONS_ENABLED, seedProfiles: (ws) => setupRecords.ensureSeeded(ws, getCollection('profiles')) }) });
  const health = new HealthService({ settings: setupSettings });
  const settingsReader = new SettingsReader({ repos, cache });
  const emailPolicy = new EmailPolicyService({ settings: settingsReader });
  const integrations = new IntegrationsService({ db, secretBox, repos, allowPrivate: config.INTEGRATIONS_ALLOW_PRIVATE_HOSTS });
  const notifier = new ChannelNotifier({ boss, integrations, logger });
  const automation = new AutomationService({ repos, cache, mail, notifier, logger, settings: settingsReader });
  const escalation = new EscalationService({ repos, automation, cache, logger });
  const seedSetup = (ws, key) => setupRecords.ensureSeeded(ws, getCollection(key));
  const addons = createAccessAddons({ enabled: config.ACCESS_ADDONS_ENABLED, db, cache, repos, seed: seedSetup }); // null when ACCESS_ADDONS_ENABLED=false: the feature never runs
  const access = new AccessService({ automation, cache, seed: seedSetup, addons });
  const objects = new ObjectsService({ repos, records: setupRecords, cache, automation, access });
  const drive = new DriveService({
    db, storage: new LocalStorageDriver(config.STORAGE_DIR), objects, cache, secret: config.JWT_SECRET,
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
  const search = new SearchService({ db: readDb, objects, cache, drive });
  const intake = new IntakeService({ objects, settings: setupSettings, secret: config.JWT_SECRET });
  const setup = {
    settings: setupSettings, records: setupRecords, health,
    metrics: new MetricsService({ repos, db: readDb, cache, usage, health }),
    userDetails: new UserDetailsService({ db, repos, cache, addons }),
    addons,
    tools: new ToolsService({ repos, records: setupRecords, mail, boss, intakeUrl, emailPolicy, escalation, objects }),
  };
  const close = async () => { await terminals?.close(); await realtime.close(); await bus.close(); usage.stop(); await usage.flush().catch(() => {}); await cache.close?.(); };

  const deployments = createDeployments({ enabled: config.DEPLOYMENTS_ENABLED, db, secretBox, repos, integrations, notifier, boss, logger });
  const terminals = createTerminals({ deployments, tokens, membershipLookup, logger });
  const features = Object.freeze({ accessAddons: Boolean(addons), deployments: Boolean(deployments) });
  return { deployments, terminals, integrations, features, linkPreviews, avatars, icons, people, chat, calls, presence, realtime, search, drive, users, escalation, emailPolicy, access, objects, intake, automation, securityPolicy, cache, usage, membershipLookup, setup, close, repos, tokens, rateLimit: createRateLimiters(repos.rateLimits), auth, password, mfa, sessions, workspaces, invitations, users, audit, oauth };
}
