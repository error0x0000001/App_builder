# Auth backlog — not yet built

Source: the Quelli design file (`setup-clone_2.html`) compared with what is implemented.
Status: **Todo** unless noted. Items marked ◇ were only seen as menu entries / demo pages in the HTML, so their exact behaviour needs a spec before building.

## A. From the HTML's user-facing auth screens

| # | Item | Notes |
|---|---|---|
| A1 | Security question + answer when accepting an invitation | Deliberately skipped (weak recovery method). Decide: build it, or formally drop it. |
| A2 | Onboarding step "Choose apps" | Product feature, not auth. Needs an apps/modules model per workspace. |
| A3 | Onboarding step "Import data" (sample data / CSV / empty) | Needs the CRM data model. |
| A4 | Onboarding step "Connect email & calendar" (Gmail / Outlook) | Needs OAuth connections + token storage. |
| A5 | Separate **username** login (HTML says "Username") | Currently the email is the login. Needs a `username` column + unique index + login/forgot changes. |
| A6 | Reset-link lifetime 24h (HTML copy) | Currently 60 min (`PASSWORD_RESET_TTL_MINUTES`). Confirm the desired value. |
| A7 | Per-workspace custom domain login (`https://<name>.my…`) | Today: lookup by workspace slug at `/login/workspace`; no real subdomain routing. |

## B. From the HTML's Setup → Identity / Security pages ◇

| # | Item |
|---|---|
| B1 | **Password Policies:** expiry (30/60/90 days / never), password history, minimum length / complexity, lockout threshold and duration — per workspace, admin-editable (currently global env/constants) |
| B2 | **Expire All Passwords:** force every member to reset on next login |
| B3 | **Login Access Policies:** admins can log in as another user (with audit trail + banner) |
| B4 | **Login Flows:** post-login flows (accept terms, MFA reminder, etc.) per profile/role |
| B5 | **Single Sign-On Settings:** per-workspace SAML 2.0 / OIDC SSO, JIT provisioning, enforce-SSO toggle |
| B6 | **Auth Providers:** more providers beyond Google (Microsoft, GitHub, Okta…), admin-configurable per workspace |
| B7 | **My Domain / Custom domain** management per workspace (DNS verification, TLS) |
| B8 | **Session Management (admin view):** list/revoke any member's sessions; **Session Settings:** timeout, lock session to originating IP |
| B9 | **Login History (admin view):** all members, filters, CSV download (current UI is per-user only) |
| B10 | **Delegated Administration** (scoped admin roles) |
| B11 | **Transaction Security / alerts** (e.g. alert on admin login, mass export) |
| B12 | **Enforce MFA** per workspace / role (members must enrol) |
| B13 | **Trusted IP ranges / login IP restrictions** |

## C. Gaps found in our own implementation (beyond the HTML)

| # | Item |
|---|---|
| C1 | Google sign-in is implemented but **untested** (no OAuth credentials were available). Needs a real run + error-path tests. |
| C2 | Change email address (re-verify new address, notify old one) |
| C3 | Delete / deactivate own account; admin deactivate member (`users.status` exists, no UI/API) |
| C4 | Breached-password check (HIBP k-anonymity) and common-password blocklist |
| C5 | Frontend automated tests (component + the Playwright flow used for screenshots is currently an ad-hoc script) |
| C6 | Account-switch UX: show per-workspace SSO/MFA requirements; workspace deletion / transfer ownership |
| C7 | Passkeys / WebAuthn and magic-link login (industry options not in the HTML) |
| C8 | Production hardening: CSP tuned for the SPA, `COOKIE_SECURE`, secrets manager, CSRF double-submit if API is ever cross-origin, PgBouncer, monthly partitioning of `auth_events` |
| C9 | Remove committed `.env.test` (dummy values) in favour of a generated one |

## D. UI building blocks to add when the first page needs them (deliberately not built yet — no demo screens)

| # | Item |
|---|---|
| D1 | Header meta text next to the title (e.g. "• 156 companies") — slot exists for actions only |
| D2 | Stat/KPI cards row, view tabs (Table / Board / List), toolbar + filter chips, data table (sortable, selectable) — styled like the reference layout |
| D3 | Sidebar extras already supported by config but unused: `badge` on items, collapsible groups with a "+" `action` |
| D4 | Per-tenant custom brand colour / logo upload on top of the preset themes |
| D5 | Persist the user's sidebar style (inset/floating) and light/dark choice server-side instead of per-browser |

## Suggested order
1. B1 + B2 + B12 (policy engine per workspace) → 2. B8 + B9 (admin visibility) → 3. B5 + B6 (SSO) → 4. A5 / C2 / C3 (account model) → 5. rest.
