CREATE TABLE "chat_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"started_by" uuid NOT NULL,
	"video" boolean DEFAULT true NOT NULL,
	"joined" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_calls_active_uq" ON "chat_calls" USING btree ("conversation_id") WHERE "chat_calls"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "chat_calls_history_idx" ON "chat_calls" USING btree ("conversation_id","created_at");