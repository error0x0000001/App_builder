ALTER TABLE "workspaces" ALTER COLUMN "theme" SET DEFAULT 'untitled';--> statement-breakpoint
UPDATE "workspaces" SET "theme" = 'untitled' WHERE "theme" = 'graphite';
