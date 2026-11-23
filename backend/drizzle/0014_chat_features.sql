CREATE TABLE "chat_hidden" (
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	CONSTRAINT "chat_hidden_user_id_conversation_id_message_id_pk" PRIMARY KEY("user_id","conversation_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "chat_link_previews" (
	"url_hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"site" text,
	"status" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_poll_votes" (
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option" integer NOT NULL,
	CONSTRAINT "chat_poll_votes_conversation_id_message_id_user_id_option_pk" PRIMARY KEY("conversation_id","message_id","user_id","option")
);
--> statement-breakpoint
CREATE TABLE "chat_stars" (
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_stars_user_id_conversation_id_message_id_pk" PRIMARY KEY("user_id","conversation_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "disappear_after" integer;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "icon_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "poll" jsonb;--> statement-breakpoint
CREATE INDEX "chat_stars_user_idx" ON "chat_stars" USING btree ("user_id","message_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_messages_expiry_idx" ON "chat_messages" USING btree ("expires_at") WHERE "chat_messages"."expires_at" is not null;