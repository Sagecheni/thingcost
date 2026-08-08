CREATE TYPE "public"."acquisition_type" AS ENUM('purchase', 'gift', 'inheritance', 'self_made', 'exchange', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."cost_knowledge" AS ENUM('known_amount', 'known_zero', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."financial_direction" AS ENUM('outflow', 'inflow');--> statement-breakpoint
CREATE TYPE "public"."financial_event_type" AS ENUM('acquisition', 'refund', 'shipping', 'tax', 'repair', 'upgrade', 'accessory', 'fee', 'disposal_fee', 'sale_proceeds', 'other');--> statement-breakpoint
CREATE TYPE "public"."ownership_state" AS ENUM('held', 'disposed');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"time_zone" varchar(100) NOT NULL,
	"base_currency" char(3) NOT NULL,
	"initialized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"counts_toward_service" boolean NOT NULL,
	"ownership_state" "ownership_state" NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_tags" (
	"asset_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "asset_tags_asset_id_tag_id_pk" PRIMARY KEY("asset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"category_id" uuid NOT NULL,
	"acquisition_type" "acquisition_type" NOT NULL,
	"acquisition_date" date NOT NULL,
	"cost_knowledge" "cost_knowledge" NOT NULL,
	"price_currency" char(3),
	"original_price_minor" bigint,
	"discount_minor" bigint,
	"brand" varchar(120),
	"model" varchar(160),
	"current_status_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	CONSTRAINT "assets_original_price_non_negative" CHECK ("assets"."original_price_minor" is null or "assets"."original_price_minor" >= 0),
	CONSTRAINT "assets_discount_non_negative" CHECK ("assets"."discount_minor" is null or "assets"."discount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(24),
	"icon" varchar(64),
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "financial_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"type" "financial_event_type" NOT NULL,
	"direction" "financial_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"base_currency" char(3) NOT NULL,
	"occurred_on" date NOT NULL,
	"include_in_net_cost" boolean NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"correction_of_id" uuid,
	CONSTRAINT "financial_events_amount_positive" CHECK ("financial_events"."amount_minor" > 0),
	CONSTRAINT "financial_events_base_amount_positive" CHECK ("financial_events"."base_amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_current_status_id_asset_statuses_id_fk" FOREIGN KEY ("current_status_id") REFERENCES "public"."asset_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_events" ADD CONSTRAINT "financial_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_status_id_asset_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."asset_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_username_unique" ON "admin_users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "asset_statuses_code_unique" ON "asset_statuses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "assets_category_id_idx" ON "assets" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "assets_current_status_id_idx" ON "assets" USING btree ("current_status_id");--> statement-breakpoint
CREATE INDEX "assets_acquisition_date_idx" ON "assets" USING btree ("acquisition_date");--> statement-breakpoint
CREATE INDEX "assets_deleted_at_idx" ON "assets" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_active_name_unique" ON "categories" USING btree (lower("name")) WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "financial_events_asset_date_idx" ON "financial_events" USING btree ("asset_id","occurred_on");--> statement-breakpoint
CREATE INDEX "lifecycle_events_asset_date_idx" ON "lifecycle_events" USING btree ("asset_id","effective_date","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_admin_id_idx" ON "sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_active_name_unique" ON "tags" USING btree (lower("name")) WHERE "tags"."deleted_at" is null;