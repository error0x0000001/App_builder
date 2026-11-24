-- Deployments (a system app): servers, projects, services, domains, deployments with logs, and scheduled jobs (commands and backups).
-- Secrets (SSH keys, environment variables, registry and Git tokens) are AES-256-GCM envelopes; nothing here is returned to the browser in the clear.
CREATE TABLE "dp_servers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'ssh' NOT NULL,
	"host" text,
	"port" integer DEFAULT 22 NOT NULL,
	"username" text DEFAULT 'root' NOT NULL,
	"ssh_key_enc" text,
	"status" text DEFAULT 'untested' NOT NULL,
	"status_message" text,
	"docker_version" text,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_environments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"env_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"server_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"app_name" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"source" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_enc" text,
	"env_enc" text,
	"auto_deploy" boolean DEFAULT true NOT NULL,
	"webhook_secret" text NOT NULL,
	"created_by" uuid,
	"last_deployed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"host" text NOT NULL,
	"path" text DEFAULT '/' NOT NULL,
	"port" integer NOT NULL,
	"https" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_deployments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"service_id" uuid,
	"server_id" uuid,
	"kind" text DEFAULT 'deploy' NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"image" text,
	"commit" text,
	"log" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dp_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"kind" text DEFAULT 'command' NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"command" text,
	"keep" integer DEFAULT 7 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dp_servers" ADD CONSTRAINT "dp_servers_ws_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "dp_projects" ADD CONSTRAINT "dp_projects_ws_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "dp_environments" ADD CONSTRAINT "dp_environments_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dp_projects"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "dp_services" ADD CONSTRAINT "dp_services_env_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."dp_environments"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "dp_services" ADD CONSTRAINT "dp_services_server_fk" FOREIGN KEY ("server_id") REFERENCES "public"."dp_servers"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "dp_domains" ADD CONSTRAINT "dp_domains_service_fk" FOREIGN KEY ("service_id") REFERENCES "public"."dp_services"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "dp_deployments" ADD CONSTRAINT "dp_deployments_service_fk" FOREIGN KEY ("service_id") REFERENCES "public"."dp_services"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "dp_jobs" ADD CONSTRAINT "dp_jobs_service_fk" FOREIGN KEY ("service_id") REFERENCES "public"."dp_services"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "dp_servers_ws_idx" ON "dp_servers" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "dp_projects_ws_idx" ON "dp_projects" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "dp_environments_project_idx" ON "dp_environments" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dp_services_app_name_uq" ON "dp_services" ("app_name");--> statement-breakpoint
CREATE INDEX "dp_services_env_idx" ON "dp_services" ("workspace_id","environment_id");--> statement-breakpoint
CREATE INDEX "dp_domains_service_idx" ON "dp_domains" ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dp_domains_host_uq" ON "dp_domains" ("workspace_id","host","path");--> statement-breakpoint
CREATE INDEX "dp_deployments_service_idx" ON "dp_deployments" ("service_id","id" DESC);--> statement-breakpoint
CREATE INDEX "dp_deployments_ws_idx" ON "dp_deployments" ("workspace_id","id" DESC);--> statement-breakpoint
CREATE INDEX "dp_jobs_enabled_idx" ON "dp_jobs" ("enabled") WHERE "enabled";
