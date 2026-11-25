/** Prints an access token (6 h) for the perf tenant owner:  node --env-file=../.env scripts/perf-token.js */
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { config } from '../src/shared/config.js';
import { db, pool } from '../src/shared/db/index.js';
import { TokenService } from '../src/shared/security/tokenService.js';

const { rows: [w] } = await db.execute(sql`select w.id as ws, u.id as owner from tenants w join memberships m on m.tenant_id = w.id and m.role = 'owner' join users u on u.id = m.user_id where w.name = 'Perf Org' limit 1`);
const tokens = new TokenService({ secret: config.JWT_SECRET, accessTtlSeconds: 6 * 3600 });
console.log(await tokens.signAccess({ userId: w.owner, sessionId: uuidv7(), tenantId: w.ws, role: 'owner' }));
await pool.end();
