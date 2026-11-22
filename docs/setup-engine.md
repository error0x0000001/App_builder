# Setup engine — design, scale model, measurements

## What it is
One registry of 266 pages (`packages/shared/src/setup/registry.generated.json`, built from the design by `tools/setup/build-registry.cjs`)
drives a generic API (`/api/v1/setup`, admins only) and six UI templates. Adding a page = adding registry data.
**The registry describes screens; it does not make settings do anything.** `docs/setup-status.md` (generated) lists, per page, whether it
is real platform data, a working tool, live metrics, records, or stored-only configuration.

| Template | Pages | Backed by |
|---|---|---|
| list | 140 | `setup_records` (generic, hash-partitioned by workspace) or an adapter onto a real table (members, sessions, logins, audit) |
| form | 85 | `setup_settings` (JSONB over registry defaults, optimistic `version`); two pages bound to the workspace record |
| dashboard / special | 8 / 7 | live queries, cached 60 s (stale-while-revalidate) |
| info (tools) | 25 | 7 working handlers (import, export, mass delete/transfer, test email, expire passwords, HTML generator); the rest are recorded and labelled "not active" |
| tree | 1 | roles as parent-linked records |

Browser bundle: the registry is **not** shipped to the client (server-only subpath `@app/shared/setup-registry`); the client loads one page
definition at a time from the API and caches it. Initial JS dropped from 223 KB to 90 KB when this was split.

## How Odoo does it (verified in the 17.0 source — see `odoo-scale-research.md`) and what we took
Odoo does **not** serve millions of users from one instance: its docs size 1 worker ≈ 6 concurrent users. It scales by many small databases,
many prefork workers, per-process caches invalidated through DB sequences, an 80-row page, a 10 000 count cap, and per-worker memory/CPU/time limits.

| Odoo | Here |
|---|---|
| 80-row pages, count capped at 10 000, count only on a full first page | same constants (`SETUP_LIST`), keyset pagination (no OFFSET) |
| `ormcache` + registry signalling | two-level cache (per-process LRU + Redis), namespace versions bumped **after commit**, invalidation over a **Redis Stream** (replayable) |
| Prefork workers, request/memory limits | `API_WORKERS` supervisor; workers retire by request count (±20 % jitter) or memory; replacement starts first; graceful drain |
| (no statement timeout) | `DB_STATEMENT_TIMEOUT_MS` + idle-in-transaction timeout |
| nested reads in one call | page definition, settings and first list page are one request each, ETag/304 |

Other guards: per-workspace request ceiling and write limiter (Redis-synced, no round trip on the hot path), single-flight loads,
serve-stale-while-refreshing, fail-open when Redis is down (falls back to memory + DB), tenant id always taken from the verified
membership, never from the request.

## Measured (this sandbox: 4 shared cores, 16 GB; API 3 workers + Postgres 16 + Redis + load generator all on the same machine)
Data: 1 workspace with 800 000 debug-log rows + 200 000 profile/permission rows, 1 000 000 login events, 200 000 members.
Postgres tuned (`shared_buffers=2GB`, `effective_cache_size=8GB`, `random_page_cost=1.1`, `work_mem=16MB`). 64 connections, 8 s per scenario,
`scripts/loadtest.js`. Reproduce: `node scripts/seed-perf.js`, start the API with `API_WORKERS=3`, `node scripts/loadtest.js <token>`.

| Scenario | req/s | p50 | p99 |
|---|---:|---:|---:|
| settings page (cached) | 10 162 | 5 ms | 19 ms |
| page definition (static) | 10 732 | 5 ms | 16 ms |
| list, first page of 800 k rows | 8 871 | 6 ms | 19 ms |
| list, first page + capped total | 7 300 | 10 ms | 227 ms |
| list, deep keyset page (400 k rows in) | 7 894 | 23 ms | 158 ms |
| search, repeated term (cached) | 9 428 | 5 ms | 19 ms |
| list, unique deep pages (never cached) | 4 595 | 11 ms | 41 ms |
| dashboard: adoption (1 M events) | 10 369 | 5 ms | 88 ms |
| adapter: login history | 8 211 | 6 ms | 23 ms |
| adapter: members (200 k) | 9 906 | 5 ms | 18 ms |
| search, never cached, matching (full 80-row pages) | 350–440 | 15–65 ms | 200–390 ms up to 32 concurrent; 560 ms at 64 |
| dashboard: storage usage, cold first compute (scans 1 M rows) | — | — | up to ~0.9 s once per minute per workspace under saturation (≈140 ms alone) |

How to read this honestly:
- **Cached and index-keyset reads reach 8–10 k req/s with p99 ≤ 25 ms** (tail up to 227 ms in two scenarios coinciding with a worker retirement or a cold query) on 4 cores that also run the database and the load generator. They scale with API processes and cores; this was not run on a multi-machine cluster.
- **10 000 simultaneous users × 10 req/s each (100 k req/s) was not tested**, and cannot be on this machine. What is shown is per-box capacity and where the cost is.
- **Uncached trigram search over a very large single collection is the weakest path** (~400 req/s, DB-bound). It stays under 500 ms p99 up to ~32 concurrent searches on this box. Mitigations if needed: a read replica for lists, `pg_trgm` only for collections above a size threshold, or an external search index.
- The cold storage-usage compute is the slowest dashboard query; it runs at most once per minute per workspace (single-flight, stale-while-refreshing), never per request.
- A tenant-scoped composite trigram index was tried and was ~2× slower for one huge tenant, so the plain trigram index + the `(workspace_id, collection, id)` btree is used.
- In-process cache and Redis hit paths cost ≈0.1 ms CPU; the bare-Express ceiling on the same box was ~7 k req/s per process, so most remaining cost is the HTTP stack itself.

## Not done / next
- ~63 pages are flagged `engine: true` in the registry: they describe behaviour (workflow, approval, assignment rules…). Their configuration is stored, nothing executes it.
- Security settings (password policy, session timeout, IP ranges, login hours) are validated, versioned, audited and scored by Health Check, but the auth code does not read them yet. This is the highest-value next step because auth already exists to enforce them.
- Compiled per-role permission cache (planned with Profiles / Permission Sets / Object Manager once they drive access).
- Cross-process lock for dashboard recomputation (today: single-flight per process, so at most one compute per worker per minute).
