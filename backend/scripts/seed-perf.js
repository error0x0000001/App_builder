/**
 * Seeds a large synthetic tenant for load testing (NOT used in production):
 *   node --env-file=../.env scripts/seed-perf.js [records=1000000] [events=1000000] [members=200000]
 * Prints a long-lived access token for the perf tenant owner (for autocannon).
 */
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { config } from '../src/shared/config.js';
import { db, pool } from '../src/shared/db/index.js';
import { TokenService } from '../src/shared/security/tokenService.js';

const [records = 1_000_000, events = 1_000_000, members = 200_000] = process.argv.slice(2).map(Number);
const CHUNK = 100_000;
const DAY_MS = 86_400_000;

// UUIDv7-shaped id from a timestamp (ms) + random tail, so inserts are time-ordered like real rows.
const uuid7Sql = (msExpr, seedExpr) => sql`(substr(lpad(to_hex((${msExpr})::bigint), 12, '0'), 1, 8) || '-' || substr(lpad(to_hex((${msExpr})::bigint), 12, '0'), 9, 4) || '-7' || substr(md5(${seedExpr}::text), 1, 3) || '-8' || substr(md5(${seedExpr}::text), 4, 3) || '-' || substr(md5(${seedExpr}::text), 7, 12))::uuid`;
const time = async (label, fn) => { const t = Date.now(); const out = await fn(); console.log(`${label}: ${((Date.now() - t) / 1000).toFixed(1)}s`); return out; };

const ws = uuidv7(); const owner = uuidv7();
await db.execute(sql`insert into users (id, email, first_name, last_name, status, email_verified_at) values (${owner}, ${`perf-${ws.slice(0, 8)}@example.com`}, 'Perf', 'Owner', 'active', now())`);
await db.execute(sql`insert into tenants (id, name, slug, created_by, onboarded_at) values (${ws}, 'Perf Org', ${`perf-${ws.slice(0, 8)}`}, ${owner}, now())`);
await db.execute(sql`insert into memberships (tenant_id, user_id, role) values (${ws}, ${owner}, 'owner')`);

const now = Date.now();
const spread = (i, total, days) => sql`(${now - days * DAY_MS} + (${i}::bigint * ${Math.floor((days * DAY_MS) / total)}))`;

await time(`members x${members}`, async () => {
  for (let from = 0; from < members; from += CHUNK) {
    const to = Math.min(from + CHUNK, members);
    await db.execute(sql`
      with gen as (select g as i, ${uuid7Sql(spread(sql`g`, members, 365), sql`g || 'u' || ${ws}`)} as id from generate_series(${from}::bigint, ${to - 1}::bigint) g),
      ins as (insert into users (id, email, first_name, last_name, status, email_verified_at, created_at)
        select id, 'u' || i || '.' || ${ws.slice(0, 8)} || '@example.com', 'User', 'N' || i, 'active', now(), now() - (i % 365 || ' days')::interval from gen returning id, created_at)
      insert into memberships (tenant_id, user_id, role, created_at) select ${ws}, id, case when random() < 0.02 then 'admin'::tenant_role else 'member'::tenant_role end, created_at from ins`);
  }
});

await time(`auth_events x${events}`, async () => {
  for (let from = 0; from < events; from += CHUNK) {
    const to = Math.min(from + CHUNK, events);
    await db.execute(sql`
      insert into auth_events (id, user_id, tenant_id, type, ip, user_agent, created_at)
      select ${uuid7Sql(spread(sql`g`, events, 60), sql`g || 'e'`)}, ${owner}, ${ws}, 'login_success', '10.0.' || (g % 250) || '.' || (g % 200), 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36', now() - ((${events}::bigint - g) * interval '4 seconds') from generate_series(${from}::bigint, ${to - 1}::bigint) g`);
  }
});

// Setup records: 80% debug logs (high volume), the rest spread over list collections.
const COLLECTIONS = [['debug-log-entries', 0.8], ['profiles', 0.1], ['permission-sets', 0.1]];
await time(`setup_records x${records}`, async () => {
  for (const [collection, share] of COLLECTIONS) {
    const total = Math.floor(records * share);
    for (let from = 0; from < total; from += CHUNK) {
      const to = Math.min(from + CHUNK, total);
      await db.execute(sql`
        insert into setup_records (id, tenant_id, collection, label, status, data, created_by)
        select ${uuid7Sql(spread(sql`g`, total, 30), sql`g || ${collection}`)}, ${ws}, ${collection},
          ${collection === 'debug-log-entries' ? sql`'user' || (g % 5000) || '@example.com'` : sql`'Item ' || g`},
          (array['Success','Assertion Failed','Fatal Error'])[1 + g % 3],
          jsonb_build_object('user', 'user' || (g % 5000) || '@example.com', 'application', 'Browser', 'operation', 'Apex ' || (g % 40), 'size', (g % 900) || ' KB', 'description', 'Synthetic record ' || g),
          ${owner}
        from generate_series(${from}::bigint, ${to - 1}::bigint) g`);
    }
  }
});

await time('analyze', () => db.execute(sql`analyze setup_records; analyze auth_events; analyze users; analyze memberships`));
const tokens = new TokenService({ secret: config.JWT_SECRET, accessTtlSeconds: 6 * 3600 });
const sessionId = uuidv7();
await db.execute(sql`insert into sessions (id, user_id, tenant_id, refresh_hash, persistent, expires_at) values (${sessionId}, ${owner}, ${ws}, 'perf', true, now() + interval '1 day')`);
console.log(JSON.stringify({ tenantId: ws, token: await tokens.signAccess({ userId: owner, sessionId, tenantId: ws, role: 'owner' }) }));
await pool.end();
