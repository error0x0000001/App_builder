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
- Visual style: **no shadows anywhere** — separate surfaces with borders only (clear, premium look). Dark mode = pitch-black page + slate surfaces. The sidebar is light by default; dark navy (#00072D) exists only as the selectable `midnight` tenant theme.
- App shell is exactly one viewport tall: sidebar + content card are fixed, **content scrolls inside the card** (header pinned); the card never grows with content.
- **Layout contract (reference: light inset sidebar, Linear/Attio-style):** sidebar = workspace switcher + collapse button, search (⌘K/Ctrl K command palette), rows (`icon + label + optional badge`), collapsible titled groups (optional "+" action), bottom links, user row with "…" menu. Content card = pinned header (page icon + title on the left, page actions slot on the right) over a scrolling body.
  Add a page by (1) adding its route in `App.jsx` and (2) one entry in `frontend/src/layouts/navigation.js` — sidebar, search and header pick it up automatically. Page header buttons: render `<PageHeaderActions>…</PageHeaderActions>` from the page. All icons come from `components/ui/Icon.jsx` (one set, `size-4` in rows). Navigation/page icons are duotone (`DUOTONE` map: soft `fill` + darker `line`); utility icons are plain line icons.
  Measured spacing (do not drift): sidebar 264px (64px collapsed: 32px squares, 24px icons); 12px side gutter; menu rows 32px with no gap (pitch 32), `text-sm`, 16px icons, `px-2`, `gap-2.5`; header block = 32px tile (+ flush collapse button), no divider, 12px, 32px search; section labels 24px with 12px between sections; user row 40px with 36px avatar. Content card: 48px header (`px-4`), body `px-4 pt-5 pb-4`, full width (pages that need a narrow form set their own `max-w-*`, left-aligned). Controls: 8px radius, buttons `rounded-(--radius-btn)` (pills only inside `.auth-scope`).
- **Tenant theming:** each workspace has a `theme` (graphite default, indigo, emerald, rose, midnight) set by admins (`PATCH /workspaces/:id/theme`) and applied to all members via `html[data-tenant-theme]`. Light/dark is separate and personal (`html[data-theme]`). Add a theme = entry in `TENANT_THEMES` (shared) + two token blocks in `frontend/src/index.css`.
- Git: work on `dev`, merge to `main` via PR. Commits authored as the owner (error0x0000001), no AI attribution lines.

## Product scope
The full product (Setup/Admin, CRM apps, ERP) is inventoried in `docs/inventory/` (generated from the design mock-up; regenerate with `tools/inventory/build-inventory.cjs`) and planned in `docs/product-roadmap.md`. Build pages as configuration on shared templates (ListPage, SettingsForm, object framework) — never one-off screens.

## Status
Auth is implemented end to end (see README "Auth features"). Remaining work is tracked in `docs/auth-backlog.md`.
