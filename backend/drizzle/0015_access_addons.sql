-- Permission-set add-ons: extra access assigned to a person on top of their role and profile (ACCESS_ADDONS_ENABLED).
-- One narrow row per (workspace, person, set). The primary key serves "what does this person have" (a prefix lookup, one index page);
-- the second index serves "who has this set" and its exact, uncapped count.
CREATE TABLE "user_permission_sets" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_set" text NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permission_sets_workspace_id_user_id_permission_set_pk" PRIMARY KEY("workspace_id","user_id","permission_set")
);
--> statement-breakpoint
ALTER TABLE "user_permission_sets" ADD CONSTRAINT "user_permission_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_sets" ADD CONSTRAINT "user_permission_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_permission_sets_by_set_idx" ON "user_permission_sets" ("workspace_id","permission_set","user_id");--> statement-breakpoint
-- Member filters and counts by role / profile ("how many Managers with profile X"): equality predicates, index-only where possible.
CREATE INDEX IF NOT EXISTS "memberships_role_profile_idx" ON "memberships" ("workspace_id","role","profile");
