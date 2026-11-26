-- Counters behind auto-number fields. One row per field, scope (workspace or whole tenant) and period (cycle), advanced atomically.
CREATE TABLE "field_sequences" (
  "tenant_id" uuid NOT NULL,
  "object_id" uuid NOT NULL,
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "scope_id" uuid NOT NULL,
  "period" text DEFAULT '' NOT NULL,
  "current" bigint NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("field_id", "scope_id", "period"),
  CONSTRAINT "field_sequences_object_fk" FOREIGN KEY ("tenant_id", "object_id") REFERENCES "objects"("tenant_id", "id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX "field_sequences_object_idx" ON "field_sequences" ("tenant_id", "object_id");
