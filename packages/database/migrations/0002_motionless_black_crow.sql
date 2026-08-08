CREATE TYPE "public"."attachment_kind" AS ENUM('photo', 'document');--> statement-breakpoint
CREATE TABLE "asset_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
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
	"is_cover" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_attachments_size_positive" CHECK ("asset_attachments"."size_bytes" > 0),
	CONSTRAINT "asset_attachments_sort_non_negative" CHECK ("asset_attachments"."sort_order" >= 0),
	CONSTRAINT "asset_attachments_dimensions_valid" CHECK (("asset_attachments"."width" is null and "asset_attachments"."height" is null) or ("asset_attachments"."width" > 0 and "asset_attachments"."height" > 0))
);
--> statement-breakpoint
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_attachments_asset_sort_idx" ON "asset_attachments" USING btree ("asset_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_attachments_storage_key_unique" ON "asset_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_attachments_thumbnail_key_unique" ON "asset_attachments" USING btree ("thumbnail_storage_key") WHERE "asset_attachments"."thumbnail_storage_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_attachments_one_cover_per_asset" ON "asset_attachments" USING btree ("asset_id") WHERE "asset_attachments"."is_cover" = true;