# Product roadmap — building the full platform

## 1. What the mock-up actually is
Not "a CRM": a platform with four layers (counts from `docs/inventory/`):

| Layer | Size |
|---|---|
| **Setup / Administration** | 266 pages in 3 groups / 14 sections |
| **CRM apps** | 7 main apps (Sales, Service, Marketing, HR, Analytics, AI studio, Setup) + 7 more (Commerce, Field Service, Revenue, Data Cloud, Digital Experiences, Slack-style chat, Tableau-style analytics) · 34 objects · 34 bespoke pages · 11 reports · 5 dashboards · 4 AI agents |
| **Back-office / ERP** | 13 apps (accounting, purchase, inventory, manufacturing, projects, timesheets, expenses…) · 29 models |
| **Cross-cutting** | auth (done), themes (done), global search, calendar, forecasting, notifications, audit |

## 2. The key idea: templates, not screens
Hand-building ~330 pages and ~63 data models would be unmaintainable and would break the "zero duplication" rule.
The mock-up itself is almost entirely configuration:

| Mock-up content | Build as |
|---|---|
| 140 Setup list pages | **one** `ListPage` driven by a config (columns, views, actions) + a generic records API |
| 83 Setup forms | **one** `SettingsForm` driven by field definitions → shared Zod schemas → generic settings API |
| 25 info pages, 8 dashboards | `InfoPage`, `DashboardPage` templates |
| ~10 bespoke builders (Object Manager, Schema Builder, Themes & Branding, Roles tree, Sharing, Debug logs, System overview, Health check…) | individual features built on the kernel |
| 34 CRM objects + 29 ERP models + custom objects | **one** metadata-driven object framework (list view, record page, form, related lists, kanban, import/export) |
| Reports / dashboards / agents | report engine, dashboard grid + chart components, agent runtime |

**Setup is mostly configuration (verified from the mock-up definitions):** 83 settings forms (255 fields, 194 of them on/off toggles), 89 lists of config records you create/edit, 51 read-only views/monitors, 25 one-shot tools (import wizard, mass transfer, expire passwords…), 8 monitoring dashboards and 10 bespoke builders/viewers. Storing and editing these is generic; ~63 of the pages only *take effect* when a behaviour engine reads them (assignment/escalation rules, workflows, duplicate/matching rules, sharing, import/export, translation…).

So the work is: **build the kernel and ~12 templates once, then add pages as configuration.**

## 3. Architecture (scale-first)
**Backend**
- **Metadata tables, per tenant:** objects, fields, layouts, list views, validation rules, picklists, record types. The UI is generated from them (this is also what Object Manager edits).
- **Record storage:** typed tables for hot core objects (Account/Contact/Lead/Opportunity/Case/Task) for speed and indexing; a JSONB `custom` column (+ expression/GIN indexes only for fields marked "indexed") for tenant-defined fields. Every table is `tenant_id`-first in its indexes; keyset pagination everywhere; optional hash partitioning by tenant for the largest tables. A generic records API serves all of it.
- **Security engine:** profiles + permission sets (object/field level), role hierarchy + sharing rules (record level), enforced in one query-builder layer so no endpoint can forget it. Audit trail + field history for every write.
- **Async:** pg-boss jobs for import/export, mass operations, reports, scheduled flows, email, webhooks; per-tenant rate limits and quotas.
- **Search:** Postgres full-text + trigram first; swap to a search service if/when needed.
- **Automation:** rules/flows as stored definitions executed by workers (triggers on record events, schedules, approvals).

**Frontend**
- New shared components, all in our theme and the layout contract: `DataTable`, `ListView` (views, filters, bulk actions), `RecordPage` (sections, related lists, activity), typed field inputs/renderers, `FormModal`, `KanbanBoard`, chart set, `DashboardGrid`, builders.
- Routes and nav are generated from metadata + `layouts/navigation.js`, so a new object/page shows up in the sidebar, search and header with the same look.

## 4. Phases (each ends with a working, tested slice)
| # | Phase | Delivers | Inventory rows covered |
|---|---|---|---|
| 0 | Foundation ✅ | Auth, workspaces, roles, invitations, sessions/MFA, tenant themes, shell/sidebar, command palette | — |
| 1 | **Identity, security & company** | Users, profiles, permission sets/groups, public groups, queues, role hierarchy, password policies, sessions, login history, SSO, enforce MFA, sharing settings, audit trail, company info, fiscal year, holidays, business hours | Users 19 · Security 21 · Identity 8 · Company 10 |
| 2 | **Platform kernel** | Object Manager + Schema Builder, custom fields/objects, picklists, layouts, list views, records API, import/export, duplicate rules, mass ops | Objects & Fields 3 · Data 21 + templates |
| 3 | **Sales core** | Lead/Account/Contact/Opportunity/Task/Event (+Campaign/Product/Quote/Contract), kanban, forecasts, calendar, reports + dashboards | objects 1–12, Sales app |
| 4 | **Email & automation** | Templates, deliverability, org-wide addresses, Gmail/Outlook sync, workflow rules, flows, approvals, email alerts | Email 18 · Process Automation 11 |
| 5 | **Service, Marketing, HR** | Cases/console/knowledge/entitlements, campaigns/journeys/segments/email studio, employees/recruiting/time-off/org chart + their feature-settings pages | most of Feature Settings 83 |
| 6 | **UI customisation & apps** | App manager, themes & branding (extends tenant themes), custom labels, tabs, translation, global actions | User Interface 20 · Apps 12 |
| 7 | **Platform/dev & operations** | API usage, webhooks/scripts, custom metadata, jobs, logs, deployment, monitoring, health, system overview | Custom Code 19 · Environments 18 |
| 8 | **Extra apps + AI** | Commerce, Field Service, Revenue, Data Cloud, Digital Experiences, chat, analytics studio; AI agents/prompt builder on the Claude API | extra apps, agents |
| 9 | **ERP** | Accounting, purchase, inventory, manufacturing, projects, timesheets, expenses | `erp.md` |

## 5. Decisions needed before building (owner's call)
1. **Salesforce-specific pages with no equivalent here** — Apex classes/triggers, Visualforce, Lightning components/Locker, AppExchange, Chatter, Data.com, Quip, Skype, WebEx, Connected Apps…: drop, or re-interpret as our own concepts (e.g. "Server scripts & webhooks", "Extensions", "Team feed")?
2. **Branding** — the mock-up uses other companies' product names and visuals (Salesforce, Agentforce, Tableau, Slack, Odoo, Quip…). Recommended: our own names and our theme everywhere (this plan already assumes it).
3. **AI agents** — a real runtime on the Claude API (needs an API key and a usage/billing model) or UI only for now?
4. **ERP** — in the first release, or after the CRM?
5. **Integrations** — Gmail/Outlook sync, Slack, payment gateways, SMS: which are real vs. "coming soon"?
6. **First phase** — recommended: Phase 1 (it finishes what the auth work started and unblocks everything else), then Phase 2.

## 6. How "nothing is missing" is enforced
- The checklist in `docs/inventory/` is generated from the mock-up, not typed by hand.
- Each row has an acceptance definition (see `docs/inventory/README.md`).
- Every feature PR lists the rows it ticks and the new coverage %.
- Later: a CI script compares `navigation.js` + the metadata registry against `counts.json` and fails if a listed page has no route.

## 7. Honest scope note
Full parity with a mature enterprise platform is a very large programme. The plan is designed so value arrives early
(Phases 1–3 give a usable multi-tenant CRM) and each later phase is mostly configuration on a stable kernel — but
it is still many iterations of work, and the decisions in §5 materially change its size.
