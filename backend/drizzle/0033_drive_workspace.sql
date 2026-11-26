-- Documents belong to a workspace (tenant-shared when null). Chat conversation folders and their files stay tenant-wide.
ALTER TABLE "drive_folders" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "drive_folders" f SET "workspace_id" = w."id" FROM "workspaces" w WHERE w."tenant_id" = f."tenant_id" AND w."is_default" AND f."kind" = 'folder';--> statement-breakpoint
UPDATE "drive_files" d SET "workspace_id" = f."workspace_id" FROM "drive_folders" f WHERE f."id" = d."folder_id";--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_workspace_fk" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "workspaces"("tenant_id", "id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_workspace_fk" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "workspaces"("tenant_id", "id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX "drive_folders_workspace_idx" ON "drive_folders" ("tenant_id", "workspace_id", "parent_id", "name");--> statement-breakpoint
CREATE INDEX "drive_files_workspace_idx" ON "drive_files" ("tenant_id", "workspace_id", "owner_id", "updated_at" DESC);
