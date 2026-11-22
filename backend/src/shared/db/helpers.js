import { uuid, timestamp } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUIDv7 primary keys keep B-tree inserts append-mostly at very high row counts. */
export const pk = (name = 'id') => uuid(name).primaryKey().$defaultFn(() => uuidv7());
export const tz = (name) => timestamp(name, { withTimezone: true });
export const createdAt = () => tz('created_at').defaultNow().notNull();
export const first = (rows) => rows[0] ?? null;
