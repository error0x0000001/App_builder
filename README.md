# App Builder

Multi-tenant, multi-workspace SaaS foundation with complete authentication. npm-workspaces monorepo:

| Path | What |
|---|---|
| `packages/shared` | Zod schemas, roles, password rules, error codes — the **single source of truth** used by API and UI |
| `backend/` | Express 5 · Drizzle ORM · PostgreSQL · pg-boss (queue on Postgres) |
| `backend/src/services/api` | HTTP API (routes → services → repositories) |
| `backend/src/services/worker` | Background jobs: transactional email, scheduled cleanup |
| `frontend/` | Vite · React · Tailwind v4 (design tokens, light + dark) |

## Run

```bash
cp .env.example .env     # set JWT_SECRET / ENCRYPTION_KEY
npm install
npm run db:up            # Postgres + Redis + Mailpit (emails at http://localhost:8025)
npm run db:migrate
npm run dev              # api :4000 · worker · web :5173
npm test                 # integration tests against a real Postgres + Redis (uses .env.test)
```

## Auth features

Email + password sign-up with 6-digit email verification · login with "remember me" · Google sign-in (OAuth code + PKCE, optional) ·
forgot/reset password (single-use hashed link) · change password · TOTP two-factor with recovery codes and replay protection ·
rotating refresh tokens with reuse detection · session list + revoke + sign-out-everywhere · login history (audit trail) ·
brute-force lockout + DB-backed rate limits · no account enumeration · multi-tenant workspaces (create, switch, sign in by workspace URL) ·
roles (owner/admin/member/viewer) with last-owner protection · invitations (new and existing users) · onboarding.

## Setup area (`/app/setup`, admins only)

265 pages driven by one registry (`packages/shared/src/setup/registry.generated.json`, generated from the design by `tools/setup/build-registry.cjs`)
and rendered by a handful of templates (list · settings form · tool · dashboard · hierarchy · specials). A page is configuration, not code.
**What is real vs. stored-only is listed per page in [`docs/setup-status.md`](docs/setup-status.md)** (generated). Architecture, scale design,
the Odoo research it follows and measured load-test results: [`docs/setup-engine.md`](docs/setup-engine.md).

## Architecture & scale notes

- **Layering / SOLID:** routes are thin; services hold business rules; repositories own SQL; `createContainer` is the only place classes are wired.
  Mail transport, password hasher and rate limiter are injected behind small interfaces.
- **No per-request DB hit for auth:** access tokens are short-lived signed JWTs; membership is re-checked from the DB only on workspace-scoped routes.
- **Indexed access paths:** unique `users(email)`, `workspaces(slug)`; `memberships(user_id, created_at)`; partial index on active sessions;
  UUIDv7 primary keys (append-mostly B-trees); keyset pagination for members and audit history (no OFFSET, no COUNT(*)).
- **Horizontal scale:** stateless API + workers; rate limits, queue and single-use tokens live in Postgres with atomic statements.
  Run more instances behind a load balancer (`TRUST_PROXY=1`). For very large installs add PgBouncer, a read replica for audit reads and
  monthly partitioning of `auth_events`.
