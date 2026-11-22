-- Object records live in setup_records under collection 'obj:<Object>'. Duplicate detection and field filters use containment (@>).
CREATE INDEX "setup_records_obj_data_idx" ON "setup_records" USING gin ("data" jsonb_path_ops) WHERE "collection" LIKE 'obj:%';--> statement-breakpoint
-- Escalation scans: open objects by age within a workspace.
CREATE INDEX "setup_records_obj_created_idx" ON "setup_records" ("workspace_id", "collection", "created_at") WHERE "collection" LIKE 'obj:%';
