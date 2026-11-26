# Objects and fields — notes (what we have, how it is stored)

Status at the time of writing: **configuration only.** Definitions are stored and served; there are no record tables and no page reads them yet. Local commit `136ebfc` on `dev` (not pushed).

## 1. Decisions taken

| Topic | Decision |
|---|---|
| Where logic lives | **Server only.** The browser sends values and renders the resolved state. No rules, validation, formulas, filtering, sorting or searching in the frontend. |
| Definition storage | **Two real tables**, `objects` and `fields`, per tenant (identical in every workspace). Per-type settings, rules, validations and autofill are validated JSON on the field row. No generic record store. |
| Numbers | `number` = whole numbers (`bigint`). `decimal`, `currency`, `percent` = Postgres `numeric` with **no fixed scale**, so 1000 stays 1000. No decimal-places setting. Values travel as strings. Currency = amount + a currency code (setting or a separate field). Postgres `money` is not used. |
| Relationships | Lookup is the default (optional, child keeps its own owner/sharing). Master-detail only for true parent–child. |
| Encryption | Every field can be marked encrypted (not picklist, relationships, computed, checkbox, uploads). Encrypted fields can't be unique or indexed. Real value encryption is **not built yet**; the flag and its constraints are. |
| Comments | Not a field type. |
| Chat | Tenant-scoped only. Everything else that belongs to a place is tenant + workspace. |
| UI | Our own components built from Untitled UI references. Booleans are always switches. No browser controls (only the hidden file input behind `useFilePicker`). |
| Git | Commits authored as the owner, no AI attribution. **Do not push without asking.** |

## 2. How it is stored in PostgreSQL (migration `0034_objects_fields.sql`)

### `objects`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | UUIDv7 |
| `tenant_id` | uuid | FK `tenants` ON DELETE CASCADE |
| `key` | text | API name; CHECK `^[A-Za-z][A-Za-z0-9_]{1,39}$`; unique per tenant, **case-insensitive** (`objects_key_uq` on `(tenant_id, lower(key))`); immutable (enforced by the service) |
| `label`, `plural_label` | text | |
| `description` | text | default `''` |
| `icon`, `color` | text | icon name from the frontend icon set; colour name |
| `kind` | text | CHECK `standard` or `custom` (only custom is created today) |
| `workspace_scope` | text | CHECK `workspace` (default) or `tenant` (shared records) |
| `has_owner`, `allow_reports`, `allow_activities`, `allow_attachments`, `track_history`, `allow_search` | boolean | feature switches |
| `record_name` | jsonb | `{ "kind": "field", "fieldKey": "title" }` or `{ "kind": "auto", "format": "R-{0000}", "start": 1 }` |
| `record_rules` | jsonb | array of record-level validations `{ id, message, condition, field?, active }` |
| `deployment_status` | text | CHECK `development` or `deployed` |
| `archived_at` | timestamptz | soft-disable |
| `created_by`, `created_at`, `updated_at` | | |

Constraints and indexes: `UNIQUE (tenant_id, id)` (target of the composite FK from `fields`), `objects_list_idx (tenant_id, archived_at, lower(label))`.

### `fields`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `object_id` | uuid | composite FK `(tenant_id, object_id)` → `objects(tenant_id, id)` ON DELETE CASCADE |
| `key` | text | CHECK `^[A-Za-z][A-Za-z0-9_]{0,40}$`; unique per object, case-insensitive (`fields_key_uq` on `(object_id, lower(key))`); immutable |
| `label`, `type` | text | `type` is one of 42 ids from the registry; immutable; validated in the app (no DB enum, so adding a type needs no migration) |
| `help_text`, `description`, `section` | text | |
| `required`, `is_unique`, `indexed`, `encrypted`, `read_only`, `system`, `active` | boolean | CHECK: not (`is_unique` and `encrypted`); not (`indexed` and `encrypted`) |
| `default_value` | jsonb | string / number / boolean / string[] / null |
| `settings` | jsonb | type-specific, validated against the type's descriptors (unknown keys rejected) |
| `rules` | jsonb | array of conditional behaviour |
| `validations` | jsonb | array of extra validations |
| `autofill` | jsonb | array of automatic values |
| `sort_order` | integer | layout order, steps of 10 |
| `created_at`, `updated_at` | timestamptz | |

Index: `fields_list_idx (tenant_id, object_id, sort_order, id)`.

### JSON shapes (all validated by zod before saving)

| Column | Shape |
|---|---|
| `settings` (picklist) | `{ "values": [{ "value": "low", "label": "Low", "color": "red", "isDefault": true, "active": true }], "restrict": true, "controllingField": null }` |
| `settings` (status_path) | `{ "stages": [{ "value": "draft", "label": "Draft", "won": false, "closed": false, "guidance": "…", "requiredFields": [] }] }` |
| `settings` (lookup) | `{ "target": "Account", "onDelete": "clear", "filter": <condition>, "filterMode": "required", "onMismatch": "warn", "searchFields": [], "columns": [], "allowCreateInline": false }` |
| `settings` (user) | `{ "profiles": [], "hierarchyRoles": [], "includeSubtree": true, "permissionSets": [], "orgRoles": [], "workspace": "current", "activeOnly": true, "filter": null }` |
| `settings` (formula) | `{ "expression": "qty * price", "returnType": "number", "blank": "zero" }` |
| `settings` (line_items) | `{ "lineObject": "ShipmentLine", "columns": [{ "field": "qty" }], "minRows": 1, "maxRows": 50, "allowAdd": true, "allowDelete": true, "allowReorder": true, "rollups": [{ "target": "total", "fn": "sum", "field": "total" }] }` |
| `settings` (file) | `{ "kind": "image", "multiple": true, "maxFiles": 5, "allowedTypes": ["png","jpg"], "maxSize": 5242880, "naming": "original", "versioning": "keep", "preview": "inline", "download": "allow", "virusScan": false, "onDelete": "trash" }` |
| condition tree | leaf `{ "ref": "this.priority", "operator": "eq", "value": "urgent" }` (or `valueRef`); group `{ "op": "and" or "or", "conditions": [...] }`; `{ "op": "not", "condition": {...} }`. Max depth 6, 60 nodes. |
| `rules[]` | `{ "id", "effect": "show" or "hide" or "require" or "lock" or "set_default" or "restrict_options" or "clear_when_hidden", "condition", "on": "create" or "edit" or "both", "appliesTo": { "roles", "profiles", "permissionSets", "workspaces" }, "active", "message", "value", "options", "order" }` |
| `validations[]` | `{ "id", "kind": "pattern" or "range" or "length" or "count" or "date_range" or "allowed_values" or "condition" or "expression", …kind fields…, "message", "active", "when" }` |
| `autofill[]` | `{ "id", "kind": "current_user" or "today" or "now" or "workspace" or "copy" or "formula" or "fixed", "source", "expression", "value", "when": "create" or "update" or "change" or "always", "whenField", "overwrite": "empty" or "always", "editable", "lockWhenFilled", "clearWhenSourceChanges", "snapshot", "condition", "order", "active" }` |

References inside conditions: `this.<field>`, `this.<lookup>.<field>`, `parent.<field>`, `line.<field>`, `lines.count`, `lines.sum|min|max.<field>`, `user.<id|role|profile|permissionSets|workspaceId|hierarchyRoles>`, `context.<mode|device|recordType|isOwner>`, `today`, `now`.

### Where numbers and types will land when records exist (decided, not built)

| Field type | Column type in the future record table |
|---|---|
| text, long text, rich text, html, email, phone, url, barcode, colour | text |
| number | bigint |
| decimal, currency, percent, slider | numeric (no scale); currency also has a currency-code column |
| rating | smallint |
| checkbox | boolean |
| date / date and time / time / duration | date / timestamptz / time / interval |
| picklist / status path | text |
| multi-select picklist | text[] |
| lookup / master-detail / user | uuid foreign key |
| many-to-many | link table |
| polymorphic lookup | two columns (object, id) |
| ip address | inet |
| encrypted | bytea (nonce + key version + ciphertext) |
| line items, checklist, tags, timer, file links | their own tables with foreign keys |

## 3. Code map

| Area | Where |
|---|---|
| Tables | `backend/drizzle/0034_objects_fields.sql`, `backend/src/shared/db/schema/objects.js` |
| Engine (server) | `backend/src/modules/objects/engine/`: `fieldTypes.js` (the registry), `conditions.js`, `expression.js`, `rules.js`, `validation.js`, `autofill.js`, `evaluate.js` |
| Service, repository, routes | `modules/objects/object.service.js`, `object.repository.js`, `schemas.js`, `services/api/routes/objects.routes.js` |
| API | `GET /objects/meta`, `GET/POST /objects`, `GET/PATCH /objects/:id`, `POST /objects/:id/archive|restore`, `GET/POST /objects/:id/fields`, `PATCH/DELETE /objects/:id/fields/:fieldId`, `PUT /objects/:id/fields/order`, `GET /objects/:id/fields/:fieldId/options`, `POST /objects/:id/evaluate` (admin only) |
| Field components | `frontend/src/components/fields/` (`FieldRenderer`, `ObjectForm`, `LineItemsGrid`, `RemotePicker`, `widgets`) |
| Configuration UI | `frontend/src/pages/setup/specials/ObjectManagerPage.jsx` and `pages/setup/objects/` (reach it at Setup › Object Manager) |
| Tests | `backend/tests/objects.test.js` |

## 4. Not built yet

- Record tables and record pages; nothing reads the definitions on a page.
- Picklist value sets (shared lists), layouts, record types, list views, search layouts.
- Field-level security tables (`field_permissions`) and a "can reveal" permission.
- Real encryption of values (key table, rotation, masking, reveal audit).
- Documents upload for file fields (the component reports file descriptions only), and server-side sanitising of rich text and HTML.
- Lookups can't list records of other objects yet.
- Line items: one evaluate request per row (batch it if rows get large).
- Standard objects aren't stored as rows yet (the 34-name catalogue stands in; creating a custom object with a standard name is refused).

## 5. Open decisions

1. **Record storage:** one real table per object (columns added by a controlled migration job), pre-allocated typed slot columns in shared tables, or a jsonb values column with the definition kept on a container (the Odoo `Properties` pattern). Not decided.
2. Which standard objects to start with (all 34, or Account, Contact, Lead, Opportunity, Case, Task).
3. Encryption: blind index for exact-match search, key per tenant or per field, and whether revealing needs its own permission.
4. What happens when a dependent lookup stops matching: clear, warn or block (default in the settings is warn).
5. Polymorphic lookup: keep for Task "Related to", or use separate lookups.

## 6. Added later: counters, apps and pages

- **Counter:** `field_sequences (field_id, scope_id, period, current)`; atomic upsert; see CLAUDE.md "Counters".
- **Apps and pages:** real tables from migration 0036 (`apps`, `app_routes`, `page_tabs`, `ui_rows`, `ui_columns`, `ui_blocks`, per-kind settings tables, `block_fields`, `block_actions`, `app_assignments`); registry in `backend/src/modules/apps/blockKinds.js`; UI in `frontend/src/pages/apps/`; launcher at `/app`. Tests: `backend/tests/apps.test.js`.
- Block data is sample data until record tables exist. Button behaviour is not stored or built.
