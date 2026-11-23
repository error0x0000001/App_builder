CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dm_key" text,
	"title" text,
	"description" text,
	"created_by" uuid NOT NULL,
	"invite_code" text,
	"meeting_at" timestamp with time zone,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"last_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_read_id" uuid,
	"muted_until" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "chat_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"conversation_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"reply_to" uuid,
	"forwarded" boolean DEFAULT false NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- full-text vector maintained by Postgres itself (no application code can forget it); 'simple' = no language-specific stemming surprises
	"tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "body")) STORED,
	CONSTRAINT "chat_messages_conversation_id_id_pk" PRIMARY KEY("conversation_id","id")
) PARTITION BY HASH ("conversation_id");--> statement-breakpoint
DO $$ BEGIN FOR i IN 0..31 LOOP EXECUTE format('CREATE TABLE "chat_messages_p%s" PARTITION OF "chat_messages" FOR VALUES WITH (MODULUS 32, REMAINDER %s)', i, i); END LOOP; END $$;--> statement-breakpoint
-- search inside the conversations a person belongs to: GIN per partition, filtered by conversation_id in the query
CREATE INDEX "chat_messages_tsv_idx" ON "chat_messages" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" ("workspace_id","sender_id","created_at" DESC);
--> statement-breakpoint
CREATE TABLE "chat_pins" (
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"pinned_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_pins_conversation_id_message_id_pk" PRIMARY KEY("conversation_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "chat_reactions" (
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_reactions_conversation_id_message_id_user_id_emoji_pk" PRIMARY KEY("conversation_id","message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversations_dm_uq" ON "chat_conversations" USING btree ("workspace_id","dm_key") WHERE "chat_conversations"."dm_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversations_invite_uq" ON "chat_conversations" USING btree ("invite_code") WHERE "chat_conversations"."invite_code" is not null;--> statement-breakpoint
CREATE INDEX "chat_members_user_idx" ON "chat_members" USING btree ("workspace_id","user_id") WHERE "chat_members"."left_at" is null;