-- Workspaces: spaces inside a tenant (a company, branch or team). People are assigned to them by an admin.
CREATE TABLE "workspaces" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_tenant_id_uq" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "workspaces_name_chk" CHECK (length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "workspaces_default_not_archived_chk" CHECK (NOT ("is_default" AND "archived_at" IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_uq" ON "workspaces" ("tenant_id", "slug");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_name_uq" ON "workspaces" ("tenant_id", lower("name")) WHERE "archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_one_default_uq" ON "workspaces" ("tenant_id") WHERE "is_default";--> statement-breakpoint

CREATE TABLE "workspace_assignments" (
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id"),
  CONSTRAINT "workspace_assignments_workspace_fk" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "workspaces"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "workspace_assignments_member_fk" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "memberships"("tenant_id", "user_id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX "workspace_assignments_user_idx" ON "workspace_assignments" ("tenant_id", "user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_assignments_one_default_uq" ON "workspace_assignments" ("tenant_id", "user_id") WHERE "is_default";--> statement-breakpoint

ALTER TABLE "sessions" ADD COLUMN "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL;--> statement-breakpoint

-- Existing data: one workspace per tenant (same name), everybody assigned to it.
INSERT INTO "workspaces" ("id", "tenant_id", "name", "slug", "is_default")
SELECT gen_random_uuid(), t."id", t."name", 'main', true FROM "tenants" t;--> statement-breakpoint
INSERT INTO "workspace_assignments" ("tenant_id", "workspace_id", "user_id", "is_default")
SELECT m."tenant_id", w."id", m."user_id", true FROM "memberships" m JOIN "workspaces" w ON w."tenant_id" = m."tenant_id" AND w."is_default";--> statement-breakpoint
UPDATE "sessions" s SET "workspace_id" = w."id" FROM "workspaces" w WHERE w."tenant_id" = s."tenant_id" AND w."is_default";
