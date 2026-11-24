CREATE TABLE IF NOT EXISTS "dp_credentials" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "url" text,
  "username" text,
  "secret_enc" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dp_credentials_ws_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "dp_credentials_ws_idx" ON "dp_credentials" ("workspace_id", "kind");
