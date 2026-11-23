CREATE TABLE "drive_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"folder_path" text NOT NULL,
	"name" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"record_object" text,
	"record_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trashed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drive_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"kind" text DEFAULT 'folder' NOT NULL,
	"record_object" text,
	"record_id" uuid,
	"inherit" boolean DEFAULT true NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trashed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drive_stars" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_stars_user_id_item_type_item_id_pk" PRIMARY KEY("user_id","item_type","item_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "drive_access_uq" ON "drive_access" USING btree ("folder_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "drive_access_principal_idx" ON "drive_access" USING btree ("workspace_id","principal_id");--> statement-breakpoint
CREATE INDEX "drive_files_list_idx" ON "drive_files" USING btree ("workspace_id","folder_id","name");--> statement-breakpoint
CREATE INDEX "drive_files_recent_idx" ON "drive_files" USING btree ("workspace_id","owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "drive_files_record_idx" ON "drive_files" USING btree ("workspace_id","record_object","record_id");--> statement-breakpoint
CREATE INDEX "drive_folders_list_idx" ON "drive_folders" USING btree ("workspace_id","parent_id","name");--> statement-breakpoint
CREATE INDEX "drive_folders_owner_idx" ON "drive_folders" USING btree ("workspace_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_folders_record_uq" ON "drive_folders" USING btree ("workspace_id","record_object","record_id") WHERE "drive_folders"."kind" = 'record';
--> statement-breakpoint
CREATE INDEX "drive_folders_path_idx" ON "drive_folders" ("workspace_id", "path" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "drive_files_path_idx" ON "drive_files" ("workspace_id", "folder_path" text_pattern_ops) WHERE "trashed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "drive_files_name_trgm_idx" ON "drive_files" USING gin (lower("name") gin_trgm_ops) WHERE "trashed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "drive_folders_name_trgm_idx" ON "drive_folders" USING gin (lower("name") gin_trgm_ops) WHERE "trashed_at" IS NULL AND "kind" = 'folder';
