CREATE TYPE "public"."wishlist_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."wishlist_status" AS ENUM('active', 'converted', 'archived');--> statement-breakpoint
CREATE TABLE "wishlist_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_item_id" uuid NOT NULL,
	"storage_key" varchar(200) NOT NULL,
	"thumbnail_storage_key" varchar(200) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"media_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_images_size_positive" CHECK ("wishlist_images"."size_bytes" > 0),
	CONSTRAINT "wishlist_images_dimensions_positive" CHECK ("wishlist_images"."width" > 0 and "wishlist_images"."height" > 0),
	CONSTRAINT "wishlist_images_media_type" CHECK ("wishlist_images"."media_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'))
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"category_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"current_price_minor" bigint,
	"current_price_observed_on" date,
	"target_price_minor" bigint,
	"budget_minor" bigint,
	"priority" "wishlist_priority" DEFAULT 'medium' NOT NULL,
	"planned_purchase_date" date,
	"status" "wishlist_status" DEFAULT 'active' NOT NULL,
	"converted_asset_id" uuid,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_current_price_non_negative" CHECK ("wishlist_items"."current_price_minor" is null or "wishlist_items"."current_price_minor" >= 0),
	CONSTRAINT "wishlist_items_target_price_non_negative" CHECK ("wishlist_items"."target_price_minor" is null or "wishlist_items"."target_price_minor" >= 0),
	CONSTRAINT "wishlist_items_budget_non_negative" CHECK ("wishlist_items"."budget_minor" is null or "wishlist_items"."budget_minor" >= 0),
	CONSTRAINT "wishlist_items_current_price_date_pair" CHECK (("wishlist_items"."current_price_minor" is null and "wishlist_items"."current_price_observed_on" is null) or ("wishlist_items"."current_price_minor" is not null and "wishlist_items"."current_price_observed_on" is not null)),
	CONSTRAINT "wishlist_items_conversion_pair" CHECK (("wishlist_items"."status" = 'converted' and "wishlist_items"."converted_asset_id" is not null and "wishlist_items"."converted_at" is not null) or ("wishlist_items"."status" <> 'converted' and "wishlist_items"."converted_asset_id" is null and "wishlist_items"."converted_at" is null))
);
--> statement-breakpoint
CREATE TABLE "wishlist_marketplace_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_item_id" uuid NOT NULL,
	"marketplace" varchar(120) NOT NULL,
	"url" text NOT NULL,
	"note" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_links_sort_non_negative" CHECK ("wishlist_marketplace_links"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wishlist_price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_item_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"observed_on" date NOT NULL,
	"marketplace_link_id" uuid,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_prices_amount_non_negative" CHECK ("wishlist_price_snapshots"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "wishlist_images" ADD CONSTRAINT "wishlist_images_wishlist_item_id_wishlist_items_id_fk" FOREIGN KEY ("wishlist_item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_converted_asset_id_assets_id_fk" FOREIGN KEY ("converted_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_marketplace_links" ADD CONSTRAINT "wishlist_marketplace_links_wishlist_item_id_wishlist_items_id_fk" FOREIGN KEY ("wishlist_item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_price_snapshots" ADD CONSTRAINT "wishlist_price_snapshots_wishlist_item_id_wishlist_items_id_fk" FOREIGN KEY ("wishlist_item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_price_snapshots" ADD CONSTRAINT "wishlist_price_snapshots_marketplace_link_id_wishlist_marketplace_links_id_fk" FOREIGN KEY ("marketplace_link_id") REFERENCES "public"."wishlist_marketplace_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_images_one_per_item" ON "wishlist_images" USING btree ("wishlist_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_images_storage_key_unique" ON "wishlist_images" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_images_thumbnail_key_unique" ON "wishlist_images" USING btree ("thumbnail_storage_key");--> statement-breakpoint
CREATE INDEX "wishlist_items_status_updated_idx" ON "wishlist_items" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "wishlist_items_category_idx" ON "wishlist_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_planned_date_idx" ON "wishlist_items" USING btree ("planned_purchase_date");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_converted_asset_unique" ON "wishlist_items" USING btree ("converted_asset_id") WHERE "wishlist_items"."converted_asset_id" is not null;--> statement-breakpoint
CREATE INDEX "wishlist_links_item_sort_idx" ON "wishlist_marketplace_links" USING btree ("wishlist_item_id","sort_order");--> statement-breakpoint
CREATE INDEX "wishlist_prices_item_date_idx" ON "wishlist_price_snapshots" USING btree ("wishlist_item_id","observed_on","created_at");