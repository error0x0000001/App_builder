CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;--> statement-breakpoint
-- setup_records: HASH-partitioned by workspace so each tenant's rows (and index pages) stay together and per-partition indexes stay small.
CREATE TABLE "setup_records" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"collection" text NOT NULL,
	"parent_id" uuid,
	"label" text DEFAULT '' NOT NULL,
	"status" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("workspace_id", "id")
) PARTITION BY HASH ("workspace_id");--> statement-breakpoint
DO $$ BEGIN FOR i IN 0..15 LOOP EXECUTE format('CREATE TABLE "setup_records_p%s" PARTITION OF "setup_records" FOR VALUES WITH (MODULUS 16, REMAINDER %s)', i, i); END LOOP; END $$;--> statement-breakpoint
-- keyset listing: newest first within (workspace, collection)
CREATE INDEX "setup_records_list_idx" ON "setup_records" ("workspace_id","collection","id" DESC);--> statement-breakpoint
-- list views filtered by status
CREATE INDEX "setup_records_status_idx" ON "setup_records" ("workspace_id","collection","status","id" DESC) WHERE "status" IS NOT NULL;--> statement-breakpoint
-- hierarchies (role tree)
CREATE INDEX "setup_records_parent_idx" ON "setup_records" ("workspace_id","collection","parent_id") WHERE "parent_id" IS NOT NULL;--> statement-breakpoint
-- "contains" search on the display label
CREATE INDEX "setup_records_label_trgm_idx" ON "setup_records" USING gin ("label" gin_trgm_ops);--> statement-breakpoint
CREATE TABLE "setup_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"page_key" text NOT NULL,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_settings" (
	"workspace_id" uuid NOT NULL,
	"page_key" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_settings_workspace_id_page_key_pk" PRIMARY KEY("workspace_id","page_key")
);
--> statement-breakpoint
CREATE INDEX "setup_audit_ws_idx" ON "setup_audit" USING btree ("workspace_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_workspace_active_idx" ON "sessions" USING btree ("workspace_id","last_used_at") WHERE "sessions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "auth_events_workspace_idx" ON "auth_events" USING btree ("workspace_id","id" DESC NULLS LAST);