# Project context (read first)

Multi-tenant, multi-workspace SaaS ("Cloudbase") — npm-workspaces monorepo. See README.md for run instructions.

- `packages/shared` — Zod schemas, roles, password rules, error codes. **Single source of truth** for API + UI validation. Never duplicate a rule in backend/frontend.
- `backend` — Express 5, Drizzle ORM, PostgreSQL, pg-boss. Layering: routes → services → repositories; wiring only in `services/api/container.js`.
  Services: `services/api` (HTTP), `services/worker` (email + cleanup jobs). Tests: `npm test` (integration, real Postgres, `.env.test`).
- `frontend` — Vite + React + Tailwind v4. Reusable UI kit in `src/components/ui`, bound form fields in `src/components/forms`; every form uses `useAppForm`. App shell = own sidebar implementation in `src/components/sidebar` (variants inset [default] | floating, icon-collapse, mobile drawer; no shadcn/Radix).
- Design reference: `setup-clone_2.html` (Cloudbase theme, navy/slate, light + dark).

## Rules from the owner
- Everything reusable (even button/checkbox/switch/input); SOLID; **zero code duplication**; remove deprecated code completely.
- Must scale to millions of users: indexed queries, keyset pagination, stateless services.
- Visual style: **no shadows anywhere** — separate surfaces with borders only (clear, premium look). Dark theme = pitch-black page + slate surfaces.
- App shell is exactly one viewport tall: sidebar + content card are fixed, **content scrolls inside the card** (header pinned); the card never grows with content.
- Git: work on `dev`, merge to `main` via PR. Commits authored as the owner (error0x0000001), no AI attribution lines.

## Status
Auth is implemented end to end (see README "Auth features"). Remaining work is tracked in `docs/auth-backlog.md`.
