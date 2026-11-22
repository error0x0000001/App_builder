import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(8000),
  DB_READ_REPLICA_URL: z.string().url().optional(), // optional read replica for read-only setup queries
  REDIS_URL: z.string().url().optional(),
  API_WORKERS: z.coerce.number().default(1), // prefork worker processes (cluster.js)
  LOG_LEVEL: z.string().default('info'),
  TRUST_PROXY: z.coerce.number().default(0),
  WORKER_CONCURRENCY: z.coerce.number().default(5),

  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32), // base64-encoded 32 bytes
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  COOKIE_SECURE: bool,

  MAX_FAILED_LOGINS: z.coerce.number().default(5),
  LOCKOUT_MINUTES: z.coerce.number().default(15),
  VERIFICATION_CODE_TTL_MINUTES: z.coerce.number().default(15),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(60),
  INVITATION_TTL_DAYS: z.coerce.number().default(7),

  MAIL_TRANSPORT: z.enum(['smtp', 'log']).default('log'),
  MAIL_FROM: z.string().default('Cloudbase <noreply@cloudbase.example>'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export const config = Object.freeze(schema.parse(process.env));
export const isProduction = config.NODE_ENV === 'production';
export const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
