-- A policy nobody has saved uses the platform defaults: passwords expire after 90 days and 10 wrong attempts lock the account
-- (the migration that created these tables provisioned them with "never" and "no limit").
ALTER TABLE "password_policies" ALTER COLUMN "expiry_days" SET DEFAULT 90;--> statement-breakpoint
ALTER TABLE "password_policies" ALTER COLUMN "max_invalid_attempts" SET DEFAULT 10;--> statement-breakpoint
UPDATE "password_policies" SET "expiry_days" = 90, "max_invalid_attempts" = 10
WHERE "updated_by" IS NULL AND "version" = 1 AND "expiry_days" IS NULL AND "max_invalid_attempts" IS NULL;
