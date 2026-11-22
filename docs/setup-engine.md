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

## Security settings that now change behaviour
Implemented in `backend/src/modules/setup/securityPolicy.service.js` and covered by integration tests. The strictest value across all of a user's workspaces applies where the action isn't tied to one workspace.

| Setting | Effect |
|---|---|
| Minimum password length | enforced on password change, reset and invitation sign-up (the platform floor of 10 always applies, so the page's "8" option has no effect) |
| Password complexity | letters + numbers, or letters + numbers + special character |
| Enforce password history | last 3 / 5 passwords (stored as hashes in `password_history`) can't be reused |
| Minimum 1-day password lifetime | blocks a second password *change* within 24 h (reset by email link is exempt) |
| User passwords expire in | expired password → sign-in refused with `PASSWORD_EXPIRED` and a reset link is emailed |
| Maximum invalid login attempts / lockout period | replaces the built-in constants; "No limit" and "Always" supported |
| Session timeout | idle sessions end at the next token refresh. **Sessions created with "remember me" are exempt** (they follow the refresh-token lifetime); this is a deliberate choice, change it in `SessionService` if you want otherwise |
| Lock sessions to originating IP | a refresh from a different IP revokes the session |
| Network Access (list) | allow-list of IP ranges at sign-in and on every refresh; the first range must contain the admin's own IP so nobody locks themselves out |

## Objects and the rule engine
Standard objects (Lead, Account, Contact, Opportunity, Case, Campaign, Task, … 34) are real: their fields come from Object Manager, records are stored under collection `obj:<Object>`
(generic partitioned store, partial GIN index for containment lookups) and are served by `/api/v1/objects/:object/records` (viewers read, members write, admins delete).
Adding a field in Object Manager changes validation and the UI immediately. The same shared schema validates in the browser and on the server.

Setup rules now execute on those records (`backend/src/modules/automation`). A rule is an ordinary Setup record; it acts only when it is **Active**, applies to the object,
passes its criteria (field / operator / value; empty = every record) **and** has its action fields filled in — otherwise it is inert.

| Setup page | Runs | Effect |
|---|---|---|
| Lead / Case Assignment Rules | before create | first matching active rule sets the owner |
| Duplicate Rules + Matching Rules | before create/update | same match field → Block (409) or Alert (warning); every hit is logged in Duplicate Error Logs |
| Workflow Rules, Process Builder, Flows | after create (and edit, per "evaluation criteria") | field update · email alert · create Task |
| Lead / Case Auto-Response Rules | after create | emails the lead/contact |
| Approval Processes | after save | record held as Pending; approver (or an admin) approves/rejects in the UI; audited |
| Escalation Rules + Case Escalations | every 15 min (job) | open cases older than N hours go to the escalation owner, once per rule; logged |
| Web-to-Lead, Web-to-Case, Email-to-Case | public endpoints | anonymous form / inbound-email webhook creates a Lead or Case when the page's switch is on (per-IP and per-workspace throttled); email-to-case address carries a secret token |
| Scheduled Jobs | — | lists the real queue schedules |
| Session Settings (HTTPS, clickjack) | every Setup request | `X-Frame-Options: DENY`; HTTPS required in production |

Limits worth knowing: a rule has **one** criterion and **one** action (several actions = several rules); picklist fields accept any text because Object Manager does not hold picklist values yet;
rules are cached 30 s per workspace and invalidated on change.

## Access control (Profiles, Permission Sets, Sharing)
Enforced on every `/api/v1/objects` call by `AccessService`, and reflected in the UI (buttons appear only when allowed).
- **Grants** are Object Settings rows (object · permission set · Yes/No for read/create/edit/delete). The container name is a **profile** (assigned on the Users page) or a **permission set** (assigned in Manage Assignments, by email). The union of everything that covers the object wins; object `All` covers every object.
- **No grant covers the object** → the workspace role's baseline: viewer reads; member reads/creates/edits; admin/owner everything.
- **Standard profiles** are seeded with their meaning: System Administrator (all), Standard User (no delete), Read Only, Minimum Access (nothing).
- **Sharing** (Sharing Settings → organization-wide defaults, seeded open): *Private* = people see only records they own; *Public Read Only* = everyone reads, only owners edit; *Public Read/Write* = open. Admins and owners always see everything.
- Not modelled yet: role-hierarchy visibility (managers seeing their reports' records), sharing rules, field-level security, record types.

## Global search (Ctrl/⌘ K)
`GET /api/v1/search?q=&type=all|records|people|setup` behind one dialog. What it searches, always limited to what the person may open:
- **Records** of every object (permission *and* sharing aware: Private objects return only the caller's own records), **people** (name / email), and — admins only — **Setup pages, individual settings and Setup records** (rules, profiles, …). Navigation pages match instantly in the browser.
- **How it stays fast:** each group runs in parallel with a hard 250 ms budget (a slow group is dropped and the response is flagged `partial`); prefix matches come from a btree index first, substring matches from a trigram index second; log-like collections are excluded from the indexes (cheaper writes, no noise). Results are cached 8 s per person and invalidated on any data, rule, sharing, profile or membership change. The client waits 120 ms after the last keystroke and cancels the request it replaces. It reads from the replica when `DB_READ_REPLICA_URL` is set.
- **Measured** (4 shared cores; 1M CRM records, 200k members, DB + API + load generator on the same box; `scripts/search-bench.js`): repeated / common queries — p99 ≤ 40 ms even at 48 concurrent searchers. Never-cached queries hit the database at ~250 req/s on this machine: p99 27 ms at 4 concurrent searchers, 101 ms at 16, 556 ms at 48 (CPU saturated — scale with cores or a read replica). A single uncached request takes ~6–30 ms. First request after a restart ~75 ms.
- **Not searched:** log-like collections (debug logs, email log, duplicate/escalation logs), audit trail and file contents. Sample Setup records appear in search after their page has been opened once (they are created lazily).

## More settings that now change behaviour
| Page | Effect |
|---|---|
| Deliverability (access level) | applied by the mail worker to every workspace email: *No access* blocks all, *System email only* blocks automation mail; Test Deliverability reports the real result |
| Compliance BCC Email | every automation email is BCC'd (system mail too if enabled) |
| Email Footers | footer appended to automation email |
| Email Log Files / Email Snapshots | every send (and every block) is logged per workspace for 30 days; downloadable as CSV |
| Business Hours + Holidays | Escalation Rules count their threshold in business hours (working days, hours, time zone, holidays); newest default row wins |
| Time-Based Workflow | previews the cases the next escalation run will move, per rule |
| Opportunity Settings | close date must be in the future; big-deal alert email to the owner (once per record) |
| Support Settings / Activity Settings | notify the case / task owner on creation |
| Login Access Policies | admins can **log in as** a member (30 min, no refresh, audited and visible in the member's activity, account changes blocked, "Exit" banner) |
| Mass Transfer Approval Requests | moves every pending approval from one approver to another |
| Mass Update Addresses | replaces one value of a field with another across an object's records (name/status protected) |

## What the UI says
Every Setup page shows its real status (one shared classifier, `packages/shared/src/setup/status.js`, feeds the API, the banner on the page and `setup-status.md`):
*Saved, but not used yet* · *Recorded only* · *External product* · *Not enabled* · *Partly enforced* (lists which settings are stored only). Pages with no banner do something.

## Not done — and why
Counts are in `setup-status.md`. What is left falls into three groups; none is a gap in the engines above.
1. **Settings for products Cloudbase does not have** (~85 pages, "Stored only"): Chatter, Einstein, Quip, Skype, Office 365, Cisco WebEx, Digital Experiences, Prospector, Field Service, Surveys, Topics, Content/Files, Mobile, Lightning Locker, Translation Workbench, Territories, Forecasts, Entitlements, Macros, Sales/Lead/Support Processes, and similar. Building a behaviour for each would mean inventing the product. They are saved, audited and clearly labelled.
2. **Connectors to external products** (9 pages, "External product"): AppExchange, Mobile Quick Start, LinkedIn Lead Gen, IoT, Snap-ins, Canvas Previewer, Integrations, Identity Connect, content-preview regeneration.
3. **Security subsystems that need an outside system to build *and verify***: SAML/SSO and Identity Provider (needs a real identity provider and signed-assertion testing — shipping unverified authentication code would be worse than not shipping it), Login Flows, Delegated Administration, Transaction Security, Platform Encryption, Certificates, CORS/CSP lists, Named Credentials, Apex/Feed/Case-comment/Topics triggers (user-written code).
Also not modelled: role-hierarchy record visibility, sharing rules, field-level security, picklist value sets, compiled per-role permission cache, cross-process dashboard lock.
