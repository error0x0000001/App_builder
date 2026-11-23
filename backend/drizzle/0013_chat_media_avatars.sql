ALTER TABLE "users" ADD COLUMN "avatar_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_media_idx" ON "chat_messages" USING btree ("conversation_id","id" DESC NULLS LAST) WHERE jsonb_array_length("chat_messages"."attachments") > 0;--> statement-breakpoint
CREATE INDEX "chat_messages_links_idx" ON "chat_messages" USING btree ("conversation_id","id" DESC NULLS LAST) WHERE "chat_messages"."body" ~ 'https?://';--> statement-breakpoint
CREATE UNIQUE INDEX "drive_folders_chat_uq" ON "drive_folders" ("workspace_id","record_id") WHERE "kind" = 'chat';
