-- Integrations: outside services (email, storage, maps…) a workspace connects with its own credentials.
-- Plain settings live in `config`; secret fields are one AES-256-GCM envelope in `secrets_enc` (never returned by the API).
-- A provider is only used when `enabled` AND `status = 'connected'`; changing its credentials resets both until it is tested again.
CREATE TABLE "workspace_integrations" (
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_enc" text,
	"status" text DEFAULT 'untested' NOT NULL,
	"status_message" text,
	"tested_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_integrations_workspace_id_provider_pk" PRIMARY KEY("workspace_id","provider")
);
--> statement-breakpoint
ALTER TABLE "workspace_integrations" ADD CONSTRAINT "workspace_integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
