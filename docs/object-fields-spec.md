# Objects and fields — specification (draft for review)

Status: **configuration built** (objects + fields tables, server-side engine, Setup › Object Manager, field components); records, layouts, field security and real encryption are not. All rules, validation and formulas run on the server; the browser only renders. Definitions are per **tenant**; records carry `tenant_id` + `workspace_id`. No generic JSON store: anything with its own rows gets a real table. "Comments / activity feed" is deliberately **not** a field type.

## 1. Properties common to every field

| Property | Meaning |
|---|---|
| `label` | Display name |
| `key` | API name; immutable; unique per object |
| `type` | One of section 2; fixed once created |
| `help_text`, `description` | Help shown to users; admin note |
| `required` | Value must be given (server-enforced; NOT NULL/CHECK where possible) |
| `unique` | Unique per tenant + object (real unique index); case rule for text |
| `external_id` | Indexed key for imports/integrations |
| `default_value` | Static value or formula |
| `autofill` | See section 6 |
| `track_history` | Changes written to history |
| `indexed` | Database index for filter/sort |
| `field_security` | Per profile / permission set: none, read, edit |
| `layout_placement` | Per layout: shown, required, read-only, hidden |
| `rules` | Conditional visible / required / read-only / options (section 7) |
| `system` | Built-in; cannot be edited or deleted |
| `active` / `deprecated` | Retire without deleting data |
| `order`, `section` | Position on layout |

## 2. Field types

| Type | Stored as | Type-specific properties | Notes |
|---|---|---|---|
| Text | `text` | max length (≤255), case-sensitive unique | Single line |
| Long text | `text` | max length (≤131,072), visible lines | Not indexable |
| Rich text | `text` (sanitised HTML) | max length, allowed formatting, image uploads to Drive, mentions | Shared sanitiser |
| HTML | `text` | mode (display-only / source editor), allowed tags + attributes, max length | No scripts, inline handlers or external frames |
| Number | `bigint` | min, max | Whole numbers only |
| Decimal | `numeric` (no fixed scale) | min, max | Stored exactly as typed; no decimal-places setting |
| Currency | `numeric` + currency code column | currency code, min, max | Amount stored exactly as typed; no decimal-places setting; multi-currency later |
| Percent | `numeric` | min, max | Stored exactly as typed |
| Checkbox | `boolean` | default checked | Never null |
| Date | `date` | default | |
| Date-time | `timestamptz` | default | Shown in the person's zone |
| Time | `time` | default | |
| Duration | `interval` | units, maximum | Static length of time |
| Timer | real `time_entries` table (record, field, person, started, stopped, note) | total shown as duration, one running timer per person, manual entries, billable flag, rounding | Start/stop on the record |
| Email | `text` | format check, unique | |
| Phone | `text` | format hint | |
| URL | `text` | allowed schemes | |
| Picklist | `text` (value) | value set (label, API value, colour, order, default, active), restrict to values, controlling field | One value |
| Multi-select picklist | `text[]` | as picklist, visible lines | Many values |
| Status path (stage) | picklist with order | ordered stages, won/closed flags, guidance per stage, required fields per stage | Progress bar |
| Lookup | `uuid` FK | target object, relationship name, related-list label, required/optional, on delete (clear/block), lookup filter | Child keeps own owner and sharing; **default relationship** |
| Master-detail | `uuid` FK NOT NULL | as lookup + cascade delete, reparenting allowed | Inherits owner/sharing; allows roll-ups; **chosen only for true parent–child** |
| Many-to-many | real join table | both objects, labels and related lists on both sides | |
| Polymorphic lookup | `object` + `id` columns | allowed target objects | No DB FK; server checks existence and access; later |
| User | `uuid` FK to a person | optional limit by profile/role | |
| Formula | computed | return type, expression, blank handling | Read-only |
| Roll-up summary | computed/stored | child object, COUNT/SUM/MIN/MAX, filter | Master-detail parents only |
| Auto-number | `bigint` + format | display format (`INV-{0000}`), start number | Unique, read-only |
| Line items | real child table (one row per line), master-detail | line object + columns, min/max rows, reorder, parent roll-ups (subtotal/tax/total), editable grid | Section 4 |
| Checklist | real child table of items | reorder, completion % | |
| Tags | real `record_tags` table | allowed tags or free entry, colours | |
| Rating | `smallint` | scale (5/10), icon | |
| Slider / progress | `numeric` | min, max, step, unit | |
| Colour | `text` (`#rrggbb`) | presets | |
| Barcode / QR | `text` | format (QR, EAN, Code 128), camera scan | |
| IP address | `inet` | version | |
| Location (map pin) | lat + long | uses connected maps provider | |
| Address | several columns | street, city, state, postcode, country | Compound |
| File / image upload | `uuid` FK(s) to Drive files | section 5 | |
| Photo / avatar | `uuid` FK to Drive file | shape, max size | Reuses photo rules |
| Signature | Drive image + signer + time | require signer identity | |
| Password / secret | `bytea` (encrypted) | mask, who may reveal | Never in lists or search |

## 3. Relationship rule

Lookup is the default (optional or required; delete = clear or block; child keeps its own owner/sharing). Master-detail only for true parent–child (invoice → lines): always required, cascade delete, inherited sharing, roll-ups. The wizard offers master-detail only after "Can the child exist without its parent? No."

## 4. Line items

| Property | Meaning |
|---|---|
| `line_object` | The child object (real table, master-detail to the parent) |
| `columns` | Which line fields show in the grid, order, widths |
| `min_rows` / `max_rows` | Row limits (may be conditional) |
| `allow_add / delete / reorder` | Row actions (may be conditional) |
| `rollups` | Parent fields fed by the lines (subtotal, tax, total) |
| `default_new_row` | Autofill for a new row |
| Rules scopes | `line.` (this row), `parent.` (top-level record), `lines.count/sum()` (all rows) |

Rules can show/hide a **column** (grid), a **cell** (per row), the whole section, restrict options per row, lock rows, set defaults. Parent change re-evaluates every row; row change re-evaluates aggregates. Server evaluates every row on save.

## 5. Upload fields (file / image)

| Property | Meaning |
|---|---|
| `kind` | file, image, document scan, video/audio |
| `multiple`, `min_files`, `max_files` | Count limits |
| `allowed_types` | MIME + extensions, checked by content on the server |
| `max_size`, `total_size` | Per file / per field (capped by organisation limit + quota) |
| `image` | Max dimensions, auto-resize, strip EXIF, crop shape/ratio, thumbnails |
| `folder` | Drive folder (default: the record's own folder in its workspace) |
| `naming` | Keep original or pattern |
| `versioning` | Keep versions or overwrite |
| `capture` | Camera/scanner, drag-and-drop, paste |
| `preview` | Inline image, PDF viewer, gallery, link |
| `download` | Allow, watermark, view-only |
| `virus_scan` | When a scanner is configured |
| `on_delete` | Trash files or keep them when the record is deleted |

Access follows the record **and** the field; admins do not read files through Documents without the record's permission. Needs record folders rebuilt as real, workspace-scoped folders.

## 6. Autofill

| Kind | Source | When |
|---|---|---|
| Default value | fixed value | create |
| Current context | current person, today, now, workspace | create |
| Copy from related record | field on a lookup target | create, or lookup changes |
| Copy from parent (line items) | `parent.Field` | new row, parent changes |
| Copy from catalogue | chosen product's fields | lookup changes |
| Formula | expression | always |
| Auto-number | counter | create |
| Rule-based | condition → value | on condition |
| Roll-up | aggregate over rows | rows change |
| Lookup by value | typed value matches a record | on entry |
| Address / geocode | selected address or pin | on entry (needs maps provider) |
| Import / integration | external id, API | on sync |
| Extract from file | text read from an upload | after upload (later, explicit service) |

| Autofill property | Meaning |
|---|---|
| `source` | Kind + source field/expression |
| `when` | create, update, when a named field changes, always |
| `overwrite` | never / only if empty / always |
| `editable` | Person may change the filled value |
| `lock_when_filled` | Read-only once filled |
| `clear_when_source_changes` | Empty it when the source is cleared |
| `snapshot` | Copy once (snapshot) or follow the source (live) |
| `condition`, `order` | Only when true; evaluation order (cycles rejected) |

## 7. Visibility and conditional rendering

Security (field security + sharing) is enforced by the server and never sends the value. Display logic is convenience in the UI **and** enforced on save for required / read-only / hidden.

| Rule property | Meaning |
|---|---|
| `object`, `scope` | Object; applies to record, line item, section, option list or layout |
| `target` | Field, column or section |
| `condition` | Expression tree (AND/OR/nesting) |
| `effect` | show, hide, require, lock, set default, restrict options, clear when hidden |
| `applies_to` | All, or profiles / permission sets / workspaces |
| `on` | create, edit, both |
| `order`, `active`, `message` | Priority; enabled; reason shown to the person |

Condition sources: this record's fields, `parent.`, `line.`, `lines.`, one-step related record, current person (role, profile, permission set, workspace, is owner), context (create/edit, record type, device), time. Operators: equals, not equals, greater/less, between, in list, contains, starts with, is blank, is changed.

## 8. Object definition

| Property | Meaning |
|---|---|
| `label`, `plural_label`, `key`, `description` | Names; `key` immutable |
| `icon`, `color` | Theme tokens |
| `kind` | standard / custom |
| `record_name` | Field or auto-number pattern |
| `workspace_scope` | workspace (default) or tenant-shared |
| Features | reports, activities, attachments, history, search |
| `sharing_default` | Existing `sharing_defaults` |
| `owner_field` | Whether records have an owner |
| `deployment_status` | In development / deployed |
| `archived_at` | Disable without deleting |

Sub-areas: fields, page layouts, record types, compact layout, list views, search layouts, validation rules, buttons/actions, field sets, object access (`object_permissions`), limits.

## 9. First slice (proposal)

text, long text, rich text, number, currency, percent, checkbox, date, date-time, email, phone, URL, picklist, lookup, user, master-detail, formula, file/image upload, auto-number → then line items + roll-ups → then timer, status path, tags, checklist → then the rest.

## 10. Open decisions

1. Record storage: a real table per object (columns added by a controlled migration job) — recommended.
2. Include "set value" and "clear when hidden" in the first rules version?
3. Keep polymorphic lookup (Task "Related to") or use separate lookups?
4. Standard objects: all 34, or a core set first?
