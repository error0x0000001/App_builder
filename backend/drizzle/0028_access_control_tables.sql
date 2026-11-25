-- Real tables for what was kept in the generic record store (setup_records / setup_settings / setup_audit / user_permission_sets):
-- profiles, permission sets and their grants, sharing defaults, the role hierarchy, the security policies, trusted networks and the audit log.
-- Everything is owned by the tenant. The generic store is dropped at the end, after its data has been copied.

-- ---------------------------------------------------------------- tables

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"user_license" text DEFAULT 'Quelli' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_name_uq" ON "profiles" ("tenant_id", lower("name"));--> statement-breakpoint

CREATE TABLE "permission_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "permission_sets_name_uq" ON "permission_sets" ("tenant_id", lower("name"));--> statement-breakpoint

-- What a profile or a permission set may do with an object ("All" = every object). Exactly one grantee per row.
CREATE TABLE "object_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"profile_id" uuid REFERENCES "profiles"("id") ON DELETE CASCADE,
	"permission_set_id" uuid REFERENCES "permission_sets"("id") ON DELETE CASCADE,
	"object_key" text NOT NULL,
	"can_read" boolean DEFAULT false NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_permissions_one_grantee" CHECK (num_nonnulls("profile_id", "permission_set_id") = 1)
);--> statement-breakpoint
CREATE UNIQUE INDEX "object_permissions_profile_uq" ON "object_permissions" ("profile_id", "object_key") WHERE "profile_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "object_permissions_set_uq" ON "object_permissions" ("permission_set_id", "object_key") WHERE "permission_set_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "object_permissions_tenant_idx" ON "object_permissions" ("tenant_id", "object_key");--> statement-breakpoint

-- A person's permission sets, on top of their role and profile. Removing the member removes these.
CREATE TABLE "permission_set_assignments" (
	"tenant_id" uuid NOT NULL,
	"permission_set_id" uuid NOT NULL REFERENCES "permission_sets"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("permission_set_id", "user_id"),
	FOREIGN KEY ("tenant_id", "user_id") REFERENCES "memberships"("tenant_id", "user_id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX "permission_set_assignments_user_idx" ON "permission_set_assignments" ("tenant_id", "user_id");--> statement-breakpoint

CREATE TABLE "sharing_defaults" (
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"object_key" text NOT NULL,
	"internal_access" text DEFAULT 'Public Read/Write' NOT NULL,
	"external_access" text DEFAULT 'Private' NOT NULL,
	"grant_via_hierarchies" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("tenant_id", "object_key"),
	CONSTRAINT "sharing_defaults_internal_chk" CHECK ("internal_access" IN ('Private', 'Public Read Only', 'Public Read/Write', 'Public Read/Write/Transfer', 'Public Full Access', 'Controlled by Parent')),
	CONSTRAINT "sharing_defaults_external_chk" CHECK ("external_access" IN ('Private', 'Public Read Only', 'Controlled by Parent'))
);--> statement-breakpoint

-- The role hierarchy (a tree per tenant). `path` is a materialised path of ids ("/root/child/"), kept by the service, so "everything below X" is one prefix scan.
CREATE TABLE "hierarchy_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"parent_id" uuid REFERENCES "hierarchy_roles"("id") ON DELETE RESTRICT,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"path" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hierarchy_roles_parent_chk" CHECK (("parent_id" IS NULL) = ("depth" = 0))
);--> statement-breakpoint
CREATE UNIQUE INDEX "hierarchy_roles_root_uq" ON "hierarchy_roles" ("tenant_id") WHERE "parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hierarchy_roles_name_uq" ON "hierarchy_roles" ("parent_id", lower("name")) WHERE "parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "hierarchy_roles_path_idx" ON "hierarchy_roles" ("tenant_id", "path" text_pattern_ops);--> statement-breakpoint

ALTER TABLE "memberships" ADD COLUMN "profile_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "hierarchy_role_id" uuid REFERENCES "hierarchy_roles"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "memberships_role_profile_id_idx" ON "memberships" ("tenant_id", "role", "profile_id");--> statement-breakpoint
CREATE INDEX "memberships_hierarchy_role_idx" ON "memberships" ("hierarchy_role_id") WHERE "hierarchy_role_id" IS NOT NULL;--> statement-breakpoint

-- Security policies: one row per tenant per page, real typed columns, optimistic `version` per page.
CREATE TABLE "password_policies" (
	"tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
	"min_length" smallint DEFAULT 8 NOT NULL CHECK ("min_length" >= 8),
	"complexity" smallint DEFAULT 1 NOT NULL CHECK ("complexity" BETWEEN 0 AND 2), -- 0 none, 1 letters + numbers, 2 letters + numbers + special
	"history_count" smallint DEFAULT 3 NOT NULL CHECK ("history_count" BETWEEN 0 AND 24),
	"expiry_days" integer CHECK ("expiry_days" > 0), -- null = never expires
	"max_invalid_attempts" smallint CHECK ("max_invalid_attempts" > 0), -- null = no limit
	"lockout_minutes" integer DEFAULT 15 NOT NULL CHECK ("lockout_minutes" >= 0), -- 0 = until an admin unlocks
	"minimum_lifetime_one_day" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "session_policies" (
	"tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
	"timeout_minutes" integer DEFAULT 120 NOT NULL CHECK ("timeout_minutes" > 0),
	"lock_to_ip" boolean DEFAULT true NOT NULL,
	"require_https" boolean DEFAULT true NOT NULL,
	"clickjack_protection" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "login_policies" (
	"tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
	"admins_can_login_as_any_user" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "network_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"start_ip" inet NOT NULL,
	"end_ip" inet NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "network_ranges_tenant_idx" ON "network_ranges" ("tenant_id", "created_at");--> statement-breakpoint

-- Who changed what. `area` is the part of the product (profiles, integrations, deployments, …).
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"area" text NOT NULL,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" ("tenant_id", "id" DESC);--> statement-breakpoint
CREATE INDEX "audit_log_area_idx" ON "audit_log" ("tenant_id", "area", "id" DESC);--> statement-breakpoint

-- ---------------------------------------------------------------- helpers (this migration only)

CREATE FUNCTION pg_temp.try_inet(t text) RETURNS inet LANGUAGE plpgsql AS $$ BEGIN RETURN t::inet; EXCEPTION WHEN others THEN RETURN NULL; END $$;--> statement-breakpoint
CREATE FUNCTION pg_temp.to_minutes(t text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN m[1] IS NULL THEN NULL ELSE m[1]::int * CASE lower(m[2]) WHEN 'minute' THEN 1 WHEN 'hour' THEN 60 ELSE 1440 END END
  FROM (SELECT regexp_match(coalesce(t, ''), '^(\d+)\s*(minute|hour|day)s?$', 'i') AS m) s
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.to_int(t text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN coalesce(t, '') ~ '^\d+' THEN (regexp_match(t, '^(\d+)'))[1]::int END $$;--> statement-breakpoint

-- ---------------------------------------------------------------- copy what exists

-- The role hierarchy keeps its ids. Paths come from a walk down from the roots.
INSERT INTO "hierarchy_roles" ("id", "tenant_id", "parent_id", "name", "description", "path", "depth", "created_at")
WITH RECURSIVE walk AS (
  SELECT r.id, r.tenant_id, NULL::uuid AS parent_id, r.label AS name, coalesce(r.data->>'description', '') AS description, '/' || r.id::text || '/' AS path, 0 AS depth, r.created_at
  FROM setup_records r WHERE r.collection = 'roles' AND r.parent_id IS NULL
    AND r.id = (SELECT o.id FROM setup_records o WHERE o.collection = 'roles' AND o.tenant_id = r.tenant_id AND o.parent_id IS NULL ORDER BY o.created_at, o.id LIMIT 1)
  UNION ALL
  SELECT c.id, c.tenant_id, c.parent_id, c.label, coalesce(c.data->>'description', ''), w.path || c.id::text || '/', w.depth + 1, c.created_at
  FROM setup_records c JOIN walk w ON c.parent_id = w.id AND c.tenant_id = w.tenant_id WHERE c.collection = 'roles'
)
SELECT DISTINCT ON (tenant_id, parent_id, lower(name)) id, tenant_id, parent_id, name, description, path, depth, created_at FROM walk ORDER BY tenant_id, parent_id, lower(name), created_at
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "profiles" ("tenant_id", "name", "description", "user_license", "is_system", "created_at")
SELECT DISTINCT ON (tenant_id, lower(label)) tenant_id, label, coalesce(data->>'description', ''), coalesce(nullif(data->>'user_license', ''), 'Quelli'),
  coalesce((data->>'custom')::boolean, false) = false, created_at
FROM setup_records WHERE collection = 'profiles' AND label <> '' ORDER BY tenant_id, lower(label), created_at
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Permission sets: every grant container that is not a profile, plus the names people were given.
INSERT INTO "permission_sets" ("tenant_id", "name")
SELECT DISTINCT ON (tenant_id, lower(name)) tenant_id, name FROM (
  SELECT tenant_id, data->>'permission_set' AS name FROM setup_records WHERE collection = 'object-settings'
  UNION ALL SELECT tenant_id, permission_set FROM user_permission_sets
  UNION ALL SELECT tenant_id, data->>'permission_set' FROM setup_records WHERE collection = 'manage-assignments'
) n
WHERE coalesce(name, '') <> '' AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.tenant_id = n.tenant_id AND lower(p.name) = lower(n.name))
ORDER BY tenant_id, lower(name)
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "object_permissions" ("tenant_id", "profile_id", "permission_set_id", "object_key", "can_read", "can_create", "can_edit", "can_delete")
SELECT DISTINCT ON (g.tenant_id, coalesce(p.id, s.id), g.data->>'object') g.tenant_id, p.id, CASE WHEN p.id IS NULL THEN s.id END, g.data->>'object',
  lower(g.data->>'read') = 'yes', lower(g.data->>'create') = 'yes', lower(g.data->>'edit') = 'yes', lower(g.data->>'delete') = 'yes'
FROM setup_records g
LEFT JOIN profiles p ON p.tenant_id = g.tenant_id AND lower(p.name) = lower(g.data->>'permission_set')
LEFT JOIN permission_sets s ON s.tenant_id = g.tenant_id AND lower(s.name) = lower(g.data->>'permission_set')
WHERE g.collection = 'object-settings' AND coalesce(g.data->>'object', '') <> '' AND coalesce(p.id, s.id) IS NOT NULL
ORDER BY g.tenant_id, coalesce(p.id, s.id), g.data->>'object', g.created_at
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "permission_set_assignments" ("tenant_id", "permission_set_id", "user_id", "assigned_by", "created_at")
SELECT a.tenant_id, s.id, a.user_id, a.assigned_by, a.created_at
FROM user_permission_sets a JOIN permission_sets s ON s.tenant_id = a.tenant_id AND lower(s.name) = lower(a.permission_set)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "permission_set_assignments" ("tenant_id", "permission_set_id", "user_id")
SELECT m.tenant_id, s.id, m.user_id
FROM setup_records r
JOIN users u ON lower(u.email) = lower(r.data->>'user')
JOIN memberships m ON m.user_id = u.id AND m.tenant_id = r.tenant_id
JOIN permission_sets s ON s.tenant_id = r.tenant_id AND lower(s.name) = lower(r.data->>'permission_set')
WHERE r.collection = 'manage-assignments'
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "sharing_defaults" ("tenant_id", "object_key", "internal_access", "external_access", "grant_via_hierarchies")
SELECT DISTINCT ON (tenant_id, data->>'object') tenant_id, data->>'object',
  CASE WHEN data->>'default_internal_access' IN ('Private', 'Public Read Only', 'Public Read/Write', 'Public Read/Write/Transfer', 'Public Full Access', 'Controlled by Parent') THEN data->>'default_internal_access' ELSE 'Public Read/Write' END,
  CASE WHEN data->>'default_external_access' IN ('Private', 'Public Read Only', 'Controlled by Parent') THEN data->>'default_external_access' ELSE 'Private' END,
  coalesce((data->>'grant_access_using_hierarchies')::boolean, true)
FROM setup_records WHERE collection = 'sharing-defaults' AND coalesce(data->>'object', '') <> '' ORDER BY tenant_id, data->>'object', created_at
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "network_ranges" ("tenant_id", "start_ip", "end_ip", "description", "created_at")
SELECT tenant_id, pg_temp.try_inet(data->>'start_ip_address'), coalesce(pg_temp.try_inet(nullif(data->>'end_ip_address', '')), pg_temp.try_inet(data->>'start_ip_address')), coalesce(data->>'description', ''), created_at
FROM setup_records WHERE collection = 'network-access' AND pg_temp.try_inet(data->>'start_ip_address') IS NOT NULL;--> statement-breakpoint

-- Security policies from the saved Setup pages (a tenant that never saved a page gets the defaults below).
INSERT INTO "password_policies" ("tenant_id", "min_length", "complexity", "history_count", "expiry_days", "max_invalid_attempts", "lockout_minutes", "minimum_lifetime_one_day", "version", "updated_by", "updated_at")
SELECT s.tenant_id,
  greatest(coalesce(pg_temp.to_int(s.values->>'minimum_password_length'), 8), 8),
  CASE s.values->>'password_complexity_requirement' WHEN 'No restriction' THEN 0 WHEN 'Must mix alpha, numeric and special characters' THEN 2 ELSE 1 END,
  coalesce(pg_temp.to_int(s.values->>'enforce_password_history'), 0),
  CASE WHEN s.values ? 'user_passwords_expire_in' THEN (CASE WHEN s.values->>'user_passwords_expire_in' = 'Never expires' THEN NULL ELSE pg_temp.to_minutes(s.values->>'user_passwords_expire_in') / 1440 END) ELSE 90 END,
  CASE WHEN s.values->>'maximum_invalid_login_attempts' = 'No limit' THEN NULL ELSE coalesce(pg_temp.to_int(s.values->>'maximum_invalid_login_attempts'), 10) END,
  CASE WHEN s.values->>'lockout_effective_period' = 'Always' THEN 0 ELSE coalesce(pg_temp.to_minutes(s.values->>'lockout_effective_period'), 15) END,
  coalesce((s.values->>'require_a_minimum_1_day_password_lifetime')::boolean, false), greatest(s.version, 1), s.updated_by, s.updated_at
FROM setup_settings s WHERE s.page_key = 'password-policies' AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = s.tenant_id)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "session_policies" ("tenant_id", "timeout_minutes", "lock_to_ip", "require_https", "clickjack_protection", "version", "updated_by", "updated_at")
SELECT s.tenant_id, coalesce(pg_temp.to_minutes(s.values->>'timeout_value'), 120),
  coalesce((s.values->>'lock_sessions_to_the_ip_address_from_which_they_originated')::boolean, true),
  coalesce((s.values->>'require_secure_connections_https')::boolean, true),
  coalesce((s.values->>'enable_clickjack_protection_for_setup_pages')::boolean, true), greatest(s.version, 1), s.updated_by, s.updated_at
FROM setup_settings s WHERE s.page_key = 'session-settings' AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = s.tenant_id)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "login_policies" ("tenant_id", "admins_can_login_as_any_user", "version", "updated_by", "updated_at")
SELECT s.tenant_id, coalesce((s.values->>'administrators_can_log_in_as_any_user')::boolean, true), greatest(s.version, 1), s.updated_by, s.updated_at
FROM setup_settings s WHERE s.page_key = 'login-access-policies' AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = s.tenant_id)
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "audit_log" ("id", "tenant_id", "user_id", "area", "action", "summary", "created_at")
SELECT a.id, a.tenant_id, a.user_id, a.page_key, a.action, a.summary, a.created_at FROM setup_audit a
WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.id = a.tenant_id) AND (a.user_id IS NULL OR EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id))
ON CONFLICT DO NOTHING;--> statement-breakpoint

UPDATE "memberships" m SET "profile_id" = p.id FROM "profiles" p WHERE p.tenant_id = m.tenant_id AND lower(p.name) = lower(m.profile) AND m.profile IS NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------- defaults every tenant must have

-- Standard profiles and what they may do (these define what the profiles mean).
INSERT INTO "profiles" ("tenant_id", "name", "description", "is_system")
SELECT t.id, v.name, v.description, true FROM tenants t
CROSS JOIN (VALUES ('System Administrator', 'Administrator profile'), ('Standard User', 'Standard profile for everyday work'), ('Read Only', 'Can see records but not change them'), ('Minimum Access - API Only', 'No access to the app; for integrations')) v(name, description)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "object_permissions" ("tenant_id", "profile_id", "object_key", "can_read", "can_create", "can_edit", "can_delete")
SELECT p.tenant_id, p.id, 'All', g.r, g.c, g.e, g.d FROM profiles p
JOIN (VALUES ('System Administrator', true, true, true, true), ('Standard User', true, true, true, false), ('Read Only', true, false, false, false), ('Minimum Access - API Only', false, false, false, false)) g(name, r, c, e, d) ON g.name = p.name
WHERE p.is_system ON CONFLICT DO NOTHING;--> statement-breakpoint

-- The hierarchy's top node is the tenant itself.
INSERT INTO "hierarchy_roles" ("tenant_id", "name", "path", "depth")
SELECT t.id, t.name, '', 0 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM hierarchy_roles h WHERE h.tenant_id = t.id AND h.parent_id IS NULL);--> statement-breakpoint
UPDATE "hierarchy_roles" SET "path" = '/' || "id"::text || '/' WHERE "path" = '';--> statement-breakpoint

INSERT INTO "password_policies" ("tenant_id") SELECT id FROM tenants ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "session_policies" ("tenant_id") SELECT id FROM tenants ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "login_policies" ("tenant_id") SELECT id FROM tenants ON CONFLICT DO NOTHING;--> statement-breakpoint

-- ---------------------------------------------------------------- drop the generic store

ALTER TABLE "memberships" DROP COLUMN "profile";--> statement-breakpoint
DROP INDEX IF EXISTS "memberships_role_profile_idx";--> statement-breakpoint
DROP TABLE "user_permission_sets";--> statement-breakpoint
DROP TABLE "setup_audit";--> statement-breakpoint
DROP TABLE "setup_settings";--> statement-breakpoint
DROP TABLE "setup_records";
