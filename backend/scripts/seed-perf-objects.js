/**
 * Adds 1M CRM records (500k Leads, 300k Accounts, 200k Contacts) to the workspace created by seed-perf.js, for search/list load tests.
 *   node --env-file=../.env scripts/seed-perf-objects.js
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/shared/db/index.js';
import { pgArray } from '../src/shared/db/helpers.js';
const { rows: [w] } = await db.execute(sql`select w.id as ws, u.id as owner, u.email from workspaces w join memberships m on m.workspace_id = w.id and m.role = 'owner' join users u on u.id = m.user_id where w.name = 'Perf Org' limit 1`);
const FIRST = ['Ada', 'Grace', 'Alan', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Tim', 'Priya', 'Chen', 'Sofia', 'Arjun', 'Meera', 'Liam', 'Aisha', 'Noah', 'Zoe', 'Omar'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Berners', 'Sharma', 'Wei', 'Alvarez', 'Mehta', 'Iyer', 'Connor', 'Khan', 'Brown', 'Chen', 'Haddad'];
const mk = async (key, n) => {
  const t = Date.now();
  for (let from = 0; from < n; from += 100_000) {
    const to = Math.min(from + 100_000, n);
    await db.execute(sql`
      insert into setup_records (id, workspace_id, collection, label, status, data, created_by)
      select (substr(lpad(to_hex((${Date.now() - 90 * 86400000}::bigint + n.g * 7)), 12, '0'), 1, 8) || '-' || substr(lpad(to_hex((${Date.now() - 90 * 86400000}::bigint + n.g * 7)), 12, '0'), 9, 4) || '-7' || substr(md5(n.g::text || ${key}), 1, 3) || '-8' || substr(md5(n.g::text || ${key}), 4, 3) || '-' || substr(md5(n.g::text || ${key}), 7, 12))::uuid,
        ${w.ws}::uuid, ${'obj:' + key}, n.name, (array['New','Qualified','Working','Closed'])[1 + (n.g % 4)::int],
        jsonb_build_object('name', n.name, 'company', 'Company ' || (n.g % 5000), 'email', lower(replace(n.name, ' ', '.')) || '@example.com', 'lead_owner', ${w.email}::text, 'account_owner', ${w.email}::text, 'contact_owner', ${w.email}::text),
        ${w.owner}::uuid
      from (select g, (${pgArray(FIRST, 'text')})[1 + (g % 20)::int] || ' ' || (${pgArray(LAST, 'text')})[1 + ((g / 20) % 20)::int] || ' ' || g as name from generate_series(${from}::bigint, ${to - 1}::bigint) g) n`);
  }
  console.log(`${key} x${n}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
};
await mk('Lead', 500_000); await mk('Account', 300_000); await mk('Contact', 200_000);
await db.execute(sql`analyze setup_records`);
console.log('ws', w.ws);
await pool.end();
