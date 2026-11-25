import { z } from 'zod';

/**
 * Deployments (a system app): servers you connect, projects with environments, and the services that run on them —
 * applications from a Docker image or a Git repository, Compose stacks, and databases. One definition of the shapes here;
 * the API validates with it and the screens are built from it.
 */
export const SERVICE_KINDS = Object.freeze(['application', 'compose', 'postgres', 'mysql', 'mariadb', 'mongo', 'redis']);
export const DATABASE_KINDS = Object.freeze(['postgres', 'mysql', 'mariadb', 'mongo', 'redis']);
export const BUILD_TYPES = Object.freeze(['dockerfile', 'nixpacks', 'railpack', 'static']);
export const SOURCE_TYPES = Object.freeze(['docker', 'git']);
export const SERVICE_STATUS = Object.freeze({ IDLE: 'idle', RUNNING: 'running', DONE: 'done', ERROR: 'error', STOPPED: 'stopped' });
export const DEPLOYMENT_STATUS = Object.freeze({ RUNNING: 'running', DONE: 'done', ERROR: 'error', CANCELLED: 'cancelled' });

/** What each database kind runs: image, the port it listens on, the data directory, and the credentials it needs. */
export const DATABASE_DEFAULTS = Object.freeze({
  postgres: { label: 'PostgreSQL', image: 'postgres:16', port: 5432, dataDir: '/var/lib/postgresql/data', user: 'postgres' },
  mysql: { label: 'MySQL', image: 'mysql:8', port: 3306, dataDir: '/var/lib/mysql', user: 'root' },
  mariadb: { label: 'MariaDB', image: 'mariadb:11', port: 3306, dataDir: '/var/lib/mysql', user: 'root' },
  mongo: { label: 'MongoDB', image: 'mongo:7', port: 27017, dataDir: '/data/db', user: 'root' },
  redis: { label: 'Redis', image: 'redis:7', port: 6379, dataDir: '/data', user: '' },
});

const NAME = z.string().trim().min(1).max(80);
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const IMAGE = /^[a-z0-9]+([._-][a-z0-9]+)*(:[0-9]+)?(\/[a-z0-9]+([._-][a-z0-9]+)*)*(:[A-Za-z0-9_][A-Za-z0-9._-]{0,127})?(@sha256:[a-f0-9]{64})?$/i;
const SAFE_PATH = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[A-Za-z0-9._\-/]*$/; // relative, no `..` segment: a build path must stay inside the cloned repository
const BRANCH = /^[A-Za-z0-9._\-/]{1,100}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Five-field cron: each field is `*`, a number, a range, a list, or a step (`*\/5`, `1-5/2`). Returns an error text or null. */
export function cronError(expr) {
  const parts = String(expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return 'A schedule has five fields: minute hour day month weekday';
  const limits = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  for (let i = 0; i < 5; i += 1) {
    for (const item of parts[i].split(',')) {
      const m = /^(\*|(\d+)(-(\d+))?)(\/(\d+))?$/.exec(item);
      if (!m) return `“${item}” is not valid in field ${i + 1}`;
      const [lo, hi] = limits[i];
      const a = m[2] === undefined ? null : Number(m[2]); const b = m[4] === undefined ? null : Number(m[4]);
      if ((a !== null && (a < lo || a > hi)) || (b !== null && (b < lo || b > hi || b < a))) return `“${item}” is out of range in field ${i + 1}`;
      if (m[6] !== undefined && Number(m[6]) < 1) return 'A step must be at least 1';
    }
  }
  return null;
}

/** True when `date` (UTC) matches the cron expression. Day-of-month and weekday combine with OR when both are restricted, as cron does. */
export function cronMatches(expr, date) {
  const f = String(expr).trim().split(/\s+/);
  const values = [date.getUTCMinutes(), date.getUTCHours(), date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCDay()];
  const hit = (field, v, lo, hi) => field.split(',').some((item) => {
    const [range, step] = item.split('/');
    const s = step ? Number(step) : 1;
    let [from, to] = range === '*' ? [lo, hi] : range.includes('-') ? range.split('-').map(Number) : [Number(range), step ? hi : Number(range)];
    if (hi === 7 && to === 7) to = 7;
    return v >= from && v <= to && (v - from) % s === 0;
  });
  const [mi, h, dom, mon, dow] = f;
  const weekday = hit(dow, values[4], 0, 7) || (values[4] === 0 && hit(dow, 7, 0, 7));
  const dayOk = dom !== '*' && dow !== '*' ? hit(dom, values[2], 1, 31) || weekday : hit(dom, values[2], 1, 31) && weekday;
  return hit(mi, values[0], 0, 59) && hit(h, values[1], 0, 23) && hit(mon, values[3], 1, 12) && dayOk;
}

export const serverBodySchema = z.object({
  name: NAME,
  host: z.string().trim().regex(HOST, 'Enter a host name or IP address'),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().trim().min(1).max(64).regex(/^[a-z_][a-z0-9_-]*$/i, 'Enter a Linux user name').default('root'),
  sshKey: z.string().trim().min(40, 'Paste the private key').max(20_000).optional(),
  sshKeyId: z.string().uuid().optional(),
});
export const serverPatchSchema = serverBodySchema.partial();
export const projectBodySchema = z.object({ name: NAME, description: z.string().trim().max(500).optional() });
export const environmentBodySchema = z.object({ name: NAME });

const envText = z.string().max(100_000).refine((text) => text.split('\n').every((line) => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return true;
  const i = t.indexOf('=');
  return i > 0 && ENV_NAME.test(t.slice(0, i).trim());
}), 'Each line must be NAME=value (blank lines and # comments are fine)');
export const envBodySchema = z.object({ env: envText });

export const sourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('docker'),
    image: z.string().trim().max(300).regex(IMAGE, 'Enter an image like nginx:1.27 or ghcr.io/org/app:tag'),
    credentialId: z.string().uuid().optional(),
    registryUser: z.string().trim().max(200).optional(), registryPassword: z.string().max(500).optional(), registryUrl: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal('git'),
    repository: z.string().trim().url('Enter the repository URL').max(500).refine((u) => /^https:\/\//i.test(u), 'Use an https:// repository URL'),
    branch: z.string().trim().regex(BRANCH, 'Enter a branch name').default('main'),
    token: z.string().max(500).optional(),
    credentialId: z.string().uuid().optional(),
    buildType: z.enum(BUILD_TYPES).default('dockerfile'),
    buildPath: z.string().trim().max(200).regex(SAFE_PATH, 'Use a plain relative path').default('.'),
    dockerfile: z.string().trim().max(200).regex(SAFE_PATH, 'Use a plain relative path').default('Dockerfile'),
    publishDirectory: z.string().trim().max(200).regex(SAFE_PATH, 'Use a plain relative path').optional(),
  }),
]);

export const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).optional(),
  replicas: z.coerce.number().int().min(0).max(50).default(1),
  memoryLimitMb: z.coerce.number().int().min(16).max(1_048_576).optional(),
  cpuLimit: z.coerce.number().min(0.05).max(256).optional(),
  command: z.string().trim().max(500).optional(),
  healthCheck: z.string().trim().max(500).optional(),
  volumes: z.array(z.object({ name: z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{0,60}$/i, 'Use letters, numbers, - _ .'), path: z.string().trim().regex(/^\/[A-Za-z0-9._\-/]*$/, 'Use an absolute path') })).max(20).default([]),
  publishedPorts: z.array(z.object({ published: z.coerce.number().int().min(1).max(65535), target: z.coerce.number().int().min(1).max(65535), protocol: z.enum(['tcp', 'udp']).default('tcp') })).max(20).default([]),
  composeFile: z.string().max(200_000).optional(),
  templateId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,80}$/).optional(),
  redirects: z.array(z.object({ regex: z.string().trim().min(1).max(300), replacement: z.string().trim().min(1).max(300), permanent: z.boolean().default(true) })).max(20).optional(),
  basicAuth: z.array(z.object({ username: z.string().trim().regex(/^[A-Za-z0-9._-]{1,40}$/, 'Letters, numbers, . _ -'), password: z.string().min(6, 'At least 6 characters').max(128).optional(), keep: z.boolean().optional() }).refine((u) => u.password || u.keep, { message: 'Enter a password', path: ['password'] })).max(20).optional(),
  previews: z.object({ enabled: z.boolean().default(false), domain: z.string().trim().toLowerCase().regex(HOST, 'Enter a domain like preview.example.com').optional().or(z.literal('')) }).optional(),
  database: z.object({ name: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/).default('app'), user: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/).default('app'), password: z.string().min(8).max(128).optional() }).optional(),
});

export const serviceCreateSchema = z.object({
  kind: z.enum(SERVICE_KINDS),
  name: NAME,
  serverId: z.string().uuid().nullable().optional(),
  source: sourceSchema.optional(),
  config: configSchema.partial().optional(),
  autoDeploy: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.kind === 'application' && !v.source) ctx.addIssue({ code: 'custom', path: ['source'], message: 'Choose where the application comes from' });
  if (v.kind === 'compose' && !v.config?.composeFile) ctx.addIssue({ code: 'custom', path: ['config', 'composeFile'], message: 'Paste the Compose file' });
});
export const servicePatchSchema = z.object({ name: NAME.optional(), serverId: z.string().uuid().nullable().optional(), source: sourceSchema.optional(), config: configSchema.partial().optional(), autoDeploy: z.boolean().optional() });

export const domainBodySchema = z.object({
  host: z.string().trim().toLowerCase().regex(HOST, 'Enter a domain like app.example.com'),
  path: z.string().trim().regex(/^\/[A-Za-z0-9._\-/]*$/, 'A path starts with /').default('/'),
  port: z.coerce.number().int().min(1).max(65535),
  https: z.boolean().default(true),
  serviceName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/, 'Use the service name from the Compose file').optional(),
});
const jobObject = z.object({
  kind: z.enum(['command', 'backup']).default('command'),
  name: NAME,
  cron: z.string().trim().refine((c) => cronError(c) === null, (c) => ({ message: cronError(c) ?? 'Invalid schedule' })),
  command: z.string().trim().max(2000).optional(),
  keep: z.coerce.number().int().min(1).max(1000).default(7),
  enabled: z.boolean().default(true),
});
export const jobBodySchema = jobObject.superRefine((v, ctx) => { if (v.kind === 'command' && !v.command) ctx.addIssue({ code: 'custom', path: ['command'], message: 'Enter the command to run' }); });
export const jobPatchSchema = jobObject.omit({ kind: true }).partial();

/** A short, URL- and Docker-safe name: `my-app-4f9a`. */
export const appNameFor = (name, suffix) => `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app'}-${suffix}`;

/** Who may do what in Deployments. Derived from the Quelli tenant role: owner/admin = manager, member = deployer, viewer = viewer. */
export const ACCESS_LEVELS = ['viewer', 'deployer', 'manager'];
export const accessRank = (level) => ACCESS_LEVELS.indexOf(level);
export const hasAccess = (have, need) => accessRank(have) >= accessRank(need) && accessRank(have) >= 0;

/** Saved logins reused by many services: a container registry (user + password/token) or a Git access token. */
export const credentialBodySchema = z.object({
  kind: z.enum(['registry', 'git', 'ssh']),
  name: z.string().trim().min(1, 'Enter a name').max(60),
  url: z.string().trim().max(200).optional(),
  username: z.string().trim().max(200).optional(),
  secret: z.string().min(1, 'Enter the password or token').max(2000),
}).superRefine((v, ctx) => {
  if (v.kind === 'registry' && !v.username) ctx.addIssue({ code: 'custom', path: ['username'], message: 'Enter the username' });
  if (v.kind === 'ssh' && !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v.secret)) ctx.addIssue({ code: 'custom', path: ['secret'], message: 'Paste a private key (it starts with -----BEGIN … PRIVATE KEY-----)' });
});
export const sshKeyGenerateSchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(60) });

/** A branch name as a DNS-safe label: `feature/Login Page` → `feature-login-page`. */
export const branchSlug = (branch) => String(branch).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'branch';
