/**
 * Load test for the Setup API against a seeded perf workspace (see seed-perf.js).
 *   node --env-file=../.env scripts/loadtest.js <token> [seconds=10] [connections=64] [baseUrl=http://127.0.0.1:4000]
 * Prints requests/s and latency percentiles per scenario. The load generator shares the machine with the server, so
 * numbers are conservative for the server alone.
 */
import autocannon from 'autocannon';
import { pool } from '../src/shared/db/index.js';
import { encodeCursor } from '../src/shared/pagination.js';

const [token, seconds = 10, connections = 64, base = 'http://127.0.0.1:4000'] = process.argv.slice(2);
const S = '/api/v1/setup';
const headers = { authorization: `Bearer ${token}` };

const { rows } = await pool.query("select id from setup_records where collection = 'debug-log-entries' order by id desc offset 400000 limit 1");
const deepCursor = encodeCursor({ id: rows[0].id });
await pool.end();

const rand = () => Math.floor(Math.random() * 5000);
const SCENARIOS = [
  ['settings (cached)', { path: `${S}/pages/password-policies/settings` }],
  ['page definition (static)', { path: `${S}/pages/profiles` }],
  ['list: first page, 800k rows', { path: `${S}/pages/debug-log-entries/records?limit=80` }],
  ['list: first page + capped total', { path: `${S}/pages/debug-log-entries/records?limit=80&total=true` }],
  ['list: deep keyset page (400k in)', { path: `${S}/pages/debug-log-entries/records?limit=80&after=${deepCursor}` }],
  ['list: search, cached term', { path: `${S}/pages/debug-log-entries/records?q=user4242` }],
  ['list: search, NEVER cached (random term)', { requests: [{ setupRequest: (r) => ({ ...r, path: `${S}/pages/debug-log-entries/records?q=user${rand()}${rand()}` }) }] }],
  ['list: unique deep pages, NEVER cached', { requests: [{ setupRequest: (r) => ({ ...r, path: `${S}/pages/debug-log-entries/records?limit=80&after=${encodeCursor({ id: rows[0].id.replace(/^......../, (m) => (parseInt(m, 16) - rand()).toString(16).padStart(8, '0')) })}` }) }] }],
  ['dashboard: adoption (1M events)', { path: `${S}/pages/adoption-manager/metrics` }],
  ['dashboard: storage usage (1M records)', { path: `${S}/pages/storage-usage/metrics` }],
  ['adapter: login history', { path: `${S}/pages/login-history/records` }],
  ['adapter: users (200k members)', { path: `${S}/pages/users/records` }],
];

for (const [name, spec] of SCENARIOS) {
  const { path, ...rest } = spec;
  const r = await autocannon({ url: `${base}${path ?? ''}`, connections: Number(connections), duration: Number(seconds), headers, workers: rest.requests ? undefined : Number(process.env.LOAD_WORKERS ?? 2), ...rest });
  const bad = r.non2xx + r.errors;
  console.log(`${name.padEnd(44)} ${String(Math.round(r.requests.average)).padStart(7)} req/s   p50 ${String(r.latency.p50).padStart(4)}ms  p97.5 ${String(r.latency.p97_5).padStart(4)}ms  p99 ${String(r.latency.p99).padStart(4)}ms  max ${String(r.latency.max).padStart(5)}ms${bad ? `   !! ${r.non2xx} non-2xx, ${r.errors} errors` : ''}`);
}
