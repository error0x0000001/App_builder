# How Odoo scales — verified against Odoo 17.0 source

Every claim below was read in the source (`odoo/odoo` branch 17.0), not taken from articles. File and symbol are given so it can be re-checked.

## Process model (`odoo/service/server.py`)
- `PreforkServer`: a master forks `workers` HTTP workers (`WorkerHTTP`) plus `max_cron_threads` (default 2) cron workers; dead workers are reaped and respawned.
- Per-worker limits, enforced by the OS and the master: `limit_request` 65536 requests then the worker retires, `limit_memory_soft` 2 GiB (worker exits after its current request), `limit_memory_hard` 2.5 GiB (`setrlimit RLIMIT_AS`), `limit_time_cpu` 60 s (`RLIMIT_CPU`, reset per request), `limit_time_real` 120 s (master kills a stuck worker). A runaway request cannot take the fleet down.
- `workers=0` falls back to a threaded dev server. Production scale = more processes + more machines behind a load balancer, no shared state in the process except caches.

## Database (`odoo/sql_db.py`)
- One pool per process, `db_maxconn` 64; a cursor is borrowed per request and returned afterwards. Isolation level REPEATABLE READ.
- **No `statement_timeout` anywhere** (grep is empty). Odoo bounds runaway queries with the worker's real-time kill. Our `statement_timeout` is therefore our own addition and is stricter than Odoo.
- No read replica or sharding in core. Scale-out of the DB is outside Odoo (external replicas / pgbouncer).

## Cache and cross-process invalidation (`odoo/tools/cache.py`, `odoo/modules/registry.py`)
- `@ormcache('args')` = per-process LRU keyed by method arguments; used for access rights (`ormcache('uid','mode')`), model/field metadata, view definitions, rules.
- Invalidation across processes uses **PostgreSQL sequences**: `base_registry_signaling` and `base_cache_signaling_<cache>`. A writer calls `nextval(...)` when its transaction commits (`signal_changes`). Every request calls `Registry.check_signaling()` (in `http.py::_serve_db`), which reads all sequence values in one query and clears any local cache whose sequence moved.
- Takeaway: caches are per-process, correctness comes from a cheap version check per request, and invalidation happens **after commit**.

## Reads and list pages (`addons/web/models/models.py`, `relational_model.js`)
- `DEFAULT_LIMIT = 80` rows per page; `DEFAULT_COUNT_LIMIT = 10000`.
- `web_search_read` only runs a count when the page came back full; the count is `search_count(domain, limit=count_limit)`, i.e. a bounded `SELECT … LIMIT` count, so the UI shows "10000+" instead of scanning millions of rows. A short page needs no count at all.
- `web_read(specification)` fetches a record **with nested one2many/many2one fields in one call**, each nested field with its own `limit`.
- Server batching constants: `PREFETCH_MAX = 1000`, `INSERT_BATCH_SIZE = 100`, `GC_UNLINK_LIMIT = 100000` (garbage collection deletes in bounded batches).
- Client: the view service caches view definitions in memory by `[model, views, context, options]` key; metadata is fetched once per session, not per navigation.

## Real-time (`addons/bus/models/bus.py`)
- Postgres `NOTIFY/LISTEN` wakes long-poll connections (`TIMEOUT = 50` s); payload size is capped (`NOTIFY_PAYLOAD_MAX_LENGTH`) and old bus rows are garbage collected.

## Not in Odoo (do not assume)
Sharding, built-in Redis, a published 10k rps figure. Odoo reaches high load by running many workers and many app servers against one tuned PostgreSQL, with heavy per-process caching.

## What we adopt and where it differs
| Odoo | Ours |
|---|---|
| Prefork workers with request/memory/CPU/time limits | `API_WORKERS` cluster launcher; workers retire by request count and RSS, master respawns |
| LRU per process, cleared by DB sequence checked each request | L1 LRU + Redis L2, namespace version bumped **after commit**, pub/sub push + 1 s version TTL (no DB query per request) |
| limit 80, count capped at 10 000, count only if page full | same constants; count only on first page and only when page is full |
| `web_read` nested spec, one call | detail endpoints return nested rows (limited) in one response |
| view/metadata cached client side | registry is static JSON in the bundle, loaded once, cached by hash; settings cached with ETag/304 |
| batch sizes 100/1000/100000 | bulk max 500, import 5 000 rows in batches, deletes batched |
| no statement timeout | we add `statement_timeout` (8 s) + `idle_in_transaction_session_timeout` |
