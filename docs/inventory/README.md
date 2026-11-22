# Product inventory (generated)

Source of truth for "what must exist". Generated from the design mock-up (`setup-clone_2.html`) by
`node tools/inventory/build-inventory.cjs <mockup.html>` — re-run it whenever the mock-up changes and review the diff.

| File | What it lists | Count |
|---|---|---|
| `setup-pages.md` | Every Setup/Administration page with its kind and contents | 266 |
| `objects.md` | CRM objects with fields, list views, related lists | 34 |
| `apps.md` | Main apps, additional apps, bespoke pages, reports, dashboards, AI agents | 7 + 7 apps, 34 pages, 11, 5, 4 |
| `erp.md` | Back-office module: apps and business models | 13 apps, 29 models |
| `counts.json` | Machine-readable totals (used for coverage checks) | — |

## Using the checklist
A row is ticked (`☒`) only when the item is **built and passes its acceptance check**:

- **List page:** every column present, saved/default views, sort + filter + keyset pagination, row actions, "New" action, empty state, permission-aware, tenant-isolated, indexed query.
- **Settings form:** every field present with the right control, shared Zod validation (client + server), persisted per tenant, audited, permission-gated, change history.
- **Info / CTA page:** content + the action actually works.
- **Object (CRM/ERP):** fields, list views, record page, create/edit, related lists, kanban where listed, import/export, field-level security.
- **Report / dashboard / agent:** definition persisted, runs against real data, shareable, permission-aware.
- **Builder (Object Manager, Schema Builder, Themes, flows…):** round-trips its configuration and the rest of the app honours it.

Coverage = ticked rows ÷ total rows per file. Keep it in the PR description of every feature PR.
