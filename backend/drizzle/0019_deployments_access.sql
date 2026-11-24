CREATE TABLE IF NOT EXISTS "dp_access" (
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "level" text NOT NULL,
  "granted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id")
);
