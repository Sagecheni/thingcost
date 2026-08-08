CREATE TABLE "subscription_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "attachment_kind" NOT NULL,
	"storage_key" varchar(200) NOT NULL,
	"thumbnail_storage_key" varchar(200),
	"original_name" varchar(255) NOT NULL,
	"media_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"width" integer,
	"height" integer,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_tags" (
	"subscription_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "subscription_tags_subscription_id_tag_id_pk" PRIMARY KEY("subscription_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "subscription_attachments" ADD CONSTRAINT "subscription_attachments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_tags" ADD CONSTRAINT "subscription_tags_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_tags" ADD CONSTRAINT "subscription_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_attachments_subscription_sort_idx" ON "subscription_attachments" USING btree ("subscription_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_attachments_storage_key_unique" ON "subscription_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_attachments_thumbnail_key_unique" ON "subscription_attachments" USING btree ("thumbnail_storage_key");--> statement-breakpoint
CREATE INDEX "subscription_tags_tag_idx" ON "subscription_tags" USING btree ("tag_id");