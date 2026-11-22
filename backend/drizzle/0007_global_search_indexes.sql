-- Global search (⌘K). Records of every object plus Setup records are found by prefix (btree) and by substring (trigram).
-- The index set EXCLUDES the high-volume log-like collections, so they cost nothing on write and never dilute search.
-- Queries must repeat the same `collection NOT IN (...)` predicate so the planner can use these partial indexes.
CREATE INDEX "setup_records_search_prefix_idx" ON "setup_records" ("workspace_id", lower("label") text_pattern_ops) WHERE "collection" NOT IN ('debug-log-entries', 'email-log', 'tool-runs', 'duplicate-error-logs', 'case-escalations');--> statement-breakpoint
CREATE INDEX "setup_records_search_trgm_idx" ON "setup_records" USING gin (lower("label") gin_trgm_ops) WHERE "collection" NOT IN ('debug-log-entries', 'email-log', 'tool-runs', 'duplicate-error-logs', 'case-escalations');--> statement-breakpoint
-- People search: name + email, substring.
CREATE INDEX "users_search_trgm_idx" ON "users" USING gin (lower("first_name" || ' ' || "last_name" || ' ' || "email") gin_trgm_ops);
