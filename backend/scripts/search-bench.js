/**
 * Global-search load test against the perf workspace (seed-perf.js + seed-perf-objects.js). Needs the API on :4000
 * (start it with SEARCH_REQUESTS_PER_10S=100000000, one user would otherwise hit the per-person limit).
 *   node --env-file=../.env scripts/perf-token.js > /tmp/perf.token;  node scripts/search-bench.js 16
 * Scenarios that repeat queries are served from the 8 s result cache; "first + last + number" and "no match" are the uncached database path.
 */
import ac from 'autocannon';
import fs from 'node:fs';
const t = fs.readFileSync(process.env.PERF_TOKEN_FILE ?? '/tmp/perf.token', 'utf8').trim();
const FIRST = ['ada', 'grace', 'alan', 'linus', 'margaret', 'dennis', 'barbara', 'ken', 'radia', 'tim', 'priya', 'chen', 'sofia', 'arjun', 'meera', 'liam', 'aisha', 'noah', 'zoe', 'omar'];
const LAST = ['lovelace', 'hopper', 'turing', 'torvalds', 'hamilton', 'ritchie', 'liskov', 'thompson', 'perlman', 'berners', 'sharma', 'wei', 'alvarez', 'mehta', 'iyer', 'connor', 'khan', 'brown', 'chen', 'haddad'];
const r = (n) => Math.floor(Math.random() * n);
const SCENARIOS = {
  'prefix, 3 chars ("ada")': () => FIRST[r(20)].slice(0, 3),
  '2 chars ("gr")': () => FIRST[r(20)].slice(0, 2),
  'full first name (prefix)': () => FIRST[r(20)],
  'substring in last name (trigram)': () => LAST[r(20)].slice(1, 6),
  'first + last + number': () => `${FIRST[r(20)]} ${LAST[r(20)]} ${r(100000)}`,
  'no match (never cached)': () => `zq${r(1e9)}x`,
  'setup/settings ("password", "sess…")': () => ['passw', 'sessi', 'login', 'email', 'profil', 'workfl'][r(6)] + (r(2) ? '' : 'o'),
};
const conns = +process.argv[2] || 16;
for (const [name, gen] of Object.entries(SCENARIOS)) {
  const res = await ac({ url: 'http://127.0.0.1:4000', connections: conns, duration: 6, headers: { authorization: `Bearer ${t}` }, requests: [{ setupRequest: (req) => ({ ...req, path: `/api/v1/search?q=${encodeURIComponent(gen())}` }) }] });
  console.log(`${name.padEnd(40)} c=${conns} ${String(Math.round(res.requests.average)).padStart(5)} req/s  p50 ${String(res.latency.p50).padStart(3)}ms  p97.5 ${String(res.latency.p97_5).padStart(3)}ms  p99 ${String(res.latency.p99).padStart(3)}ms  max ${String(res.latency.max).padStart(4)}ms  non2xx ${res.non2xx}`);
}
