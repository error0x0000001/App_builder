-- Each assignment gets its own id (the Setup lists address rows by id); a person still holds a set once.
ALTER TABLE "permission_set_assignments" DROP CONSTRAINT "permission_set_assignments_pkey";--> statement-breakpoint
ALTER TABLE "permission_set_assignments" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "permission_set_assignments" ADD PRIMARY KEY ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_set_assignments_uq" ON "permission_set_assignments" ("permission_set_id", "user_id");
