ALTER TABLE "dp_services" ADD COLUMN IF NOT EXISTS "preview_of" uuid REFERENCES "dp_services"("id") ON DELETE cascade;
ALTER TABLE "dp_services" ADD COLUMN IF NOT EXISTS "preview_branch" text;
CREATE UNIQUE INDEX IF NOT EXISTS "dp_services_preview_uq" ON "dp_services" ("preview_of", "preview_branch") WHERE "preview_of" IS NOT NULL;
