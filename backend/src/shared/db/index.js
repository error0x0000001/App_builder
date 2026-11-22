import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema/index.js';

const poolOptions = (connectionString) => ({
  connectionString,
  max: config.DB_POOL_MAX,
  // fail fast instead of piling up behind a slow query (Odoo-style limits)
  statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
  idle_in_transaction_session_timeout: 15_000,
});
export const pool = new pg.Pool(poolOptions(config.DATABASE_URL));
/** Read-only pool for list/dashboard reads; falls back to the primary when no replica is configured. */
export const readPool = config.DB_READ_REPLICA_URL ? new pg.Pool(poolOptions(config.DB_READ_REPLICA_URL)) : pool;
export const db = drizzle(pool, { schema });
export const readDb = readPool === pool ? db : drizzle(readPool, { schema });
