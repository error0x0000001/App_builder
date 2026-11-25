# Tenants and workspaces

Status: **phases 1–2 built** (tenants; workspaces + assignments + switcher; see CLAUDE.md "Status"). Phases 3–5 not built. The plan below splits the customer from the space a person works in, the way Odoo (companies inside one database) and Salesforce (one org, many business units) do.

## The model

| Level | What it is | Owns |
|---|---|---|
| **Tenant** | The customer / company account. One per signed-up organisation. | People, roles, profiles and permission sets, object and field definitions, apps and navigation, integrations, billing, branding, themes, Deployments servers, audit. |
| **Workspace** | A space inside a tenant: a company, branch, legal entity or team (Odoo "company"). | Its records, its dashboards, its chat and documents. |
| **Person** | One login, global to the product. | Belongs to **one or more tenants**; inside a tenant is **assigned** to the workspaces they may use. |

Rules:

1. **Everything configurable is tied to the tenant.** An object, a field, a profile, an app or an integration is defined once per tenant and is the same in every workspace.
2. **A record belongs to one workspace** (like Odoo's `company_id`). Definitions are shared, data is not.
3. **Admins assign people to workspaces** (Odoo "allowed companies", Salesforce user ↔ business unit). There is no entity layer: the workspace *is* the legal-entity / branch / team level. A person's list of assigned workspaces decides what appears in the workspace switcher and which records they can see.
4. **One role and profile per person per tenant** (as Odoo groups and Salesforce profiles are global). Access to *records* is narrowed by the workspaces they are assigned to and by Sharing, exactly as today.
5. A person works in **one current workspace** and may switch to any assigned one. Optionally they can turn on several at once (Odoo's multi-company switch) to see combined lists.
6. Isolation boundary = **tenant**. Nothing crosses it. Inside a tenant, workspaces are an access scope, not a security wall.

## What changes in the data

New:

- `tenants (id, name, slug, theme, ui_settings, created_by, …)` — the columns that are really tenant-level today on `workspaces`.
- `tenant_memberships (tenant_id, user_id, role, profile…)` — today's `memberships`, one row per person per tenant.
- `workspace_assignments (tenant_id, workspace_id, user_id, is_default)` — which workspaces a person may use.

Changed:

- `workspaces` keeps `id`, `name`, `slug`; gains `tenant_id`; loses the tenant-level settings.
- Tenant-level tables get `tenant_id` instead of `workspace_id`: `setup_records` (object/field/profile/permission-set definitions), `setup_settings`, `setup_audit`, `workspace_integrations`, `user_permission_sets`, `invitations`, `dp_*` (Deployments), and `sessions`' active-tenant claim.
- Workspace-level tables keep `workspace_id` **and** gain `tenant_id`: object records, `chat_*`, `drive_*`.
- Object records: `obj:<Object>` rows carry `workspace_id`; list and search add "workspaces you are assigned to".

Existing data: every current workspace becomes a tenant with exactly one workspace of the same name, and every membership becomes a tenant membership plus an assignment to that workspace. Nothing is lost and nothing changes for users until a second workspace is created.

## What changes in behaviour

- **Login** resolves the tenant (a person in several tenants picks one), then lands in their default workspace.
- **Access token** carries `tenantId` and `workspaceId`; `membershipLookup` verifies the tenant membership and the assignment on every request, as it verifies the membership today.
- **Navigation and apps** are generated per tenant from the apps a person is assigned (see `apps` below), not from a static list.
- **Switcher** lists the person's assigned workspaces; admins add and remove assignments in Setup › Users.
- **Records** are filtered by tenant, then by assigned workspaces, then by the existing Profile / Permission Set / Sharing rules.

## Phases (suite green after each)

1. **Tenants.** Add `tenants`, backfill one per current workspace, add `tenant_id` everywhere, move tenant-level settings, switch token and lookup to `tenantId`. No behaviour change.
2. **Workspaces inside a tenant.** `workspace_assignments`, the switcher, create/rename/archive a workspace, default workspace.
3. **Records by workspace.** Object records, chat and drive scoped by assigned workspaces; multi-workspace view.
4. **Apps and navigation.** An `app` record (key, label, icon, colour, ordered items: objects, pages, system apps); assigned to profiles / permission sets; navigation generated from it; custom objects appear when added to an app.
5. **Objects.** Record detail page, real Lookup relationships with related lists, picklist values, saved list views.

## Open points to confirm before phase 1

- Does a person keep **one role for the whole tenant**, or can the role differ per workspace? (Plan assumes one; per-workspace roles can be added later as an override.)
- Can one person belong to **several tenants** (consultant, agency)? (Plan assumes yes, as users are global today.)
- Naming in the UI: keep "Workspace" for the inner space, and "Organisation" for the tenant?
