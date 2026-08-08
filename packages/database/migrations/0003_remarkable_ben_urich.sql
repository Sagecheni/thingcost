CREATE TYPE "public"."asset_relationship_type" AS ENUM('belongs_to', 'paired_with');--> statement-breakpoint
CREATE TYPE "public"."order_allocation_method" AS ENUM('proportional', 'manual');--> statement-breakpoint
CREATE TABLE "asset_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"target_asset_id" uuid NOT NULL,
	"type" "asset_relationship_type" NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_relationships_not_self" CHECK ("asset_relationships"."source_asset_id" <> "asset_relationships"."target_asset_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"acquisition_financial_event_id" uuid,
	"listed_price_minor" bigint NOT NULL,
	"allocated_discount_minor" bigint DEFAULT 0 NOT NULL,
	"allocated_shipping_minor" bigint DEFAULT 0 NOT NULL,
	"allocated_tax_minor" bigint DEFAULT 0 NOT NULL,
	"allocated_fee_minor" bigint DEFAULT 0 NOT NULL,
	"allocation_adjustment_minor" bigint DEFAULT 0 NOT NULL,
	"allocated_amount_minor" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_items_listed_non_negative" CHECK ("purchase_order_items"."listed_price_minor" >= 0),
	CONSTRAINT "purchase_order_items_discount_non_negative" CHECK ("purchase_order_items"."allocated_discount_minor" >= 0),
	CONSTRAINT "purchase_order_items_shipping_non_negative" CHECK ("purchase_order_items"."allocated_shipping_minor" >= 0),
	CONSTRAINT "purchase_order_items_tax_non_negative" CHECK ("purchase_order_items"."allocated_tax_minor" >= 0),
	CONSTRAINT "purchase_order_items_fee_non_negative" CHECK ("purchase_order_items"."allocated_fee_minor" >= 0),
	CONSTRAINT "purchase_order_items_amount_non_negative" CHECK ("purchase_order_items"."allocated_amount_minor" >= 0),
	CONSTRAINT "purchase_order_items_discount_within_listed" CHECK ("purchase_order_items"."allocated_discount_minor" <= "purchase_order_items"."listed_price_minor"),
	CONSTRAINT "purchase_order_items_amount_matches_components" CHECK ("purchase_order_items"."allocated_amount_minor" = "purchase_order_items"."listed_price_minor" - "purchase_order_items"."allocated_discount_minor" + "purchase_order_items"."allocated_shipping_minor" + "purchase_order_items"."allocated_tax_minor" + "purchase_order_items"."allocated_fee_minor" + "purchase_order_items"."allocation_adjustment_minor"),
	CONSTRAINT "purchase_order_items_sort_non_negative" CHECK ("purchase_order_items"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant" varchar(160),
	"order_number" varchar(160),
	"ordered_on" date NOT NULL,
	"currency" char(3) NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"shipping_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"total_paid_minor" bigint NOT NULL,
	"allocation_method" "order_allocation_method" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_subtotal_positive" CHECK ("purchase_orders"."subtotal_minor" > 0),
	CONSTRAINT "purchase_orders_discount_non_negative" CHECK ("purchase_orders"."discount_minor" >= 0),
	CONSTRAINT "purchase_orders_shipping_non_negative" CHECK ("purchase_orders"."shipping_minor" >= 0),
	CONSTRAINT "purchase_orders_tax_non_negative" CHECK ("purchase_orders"."tax_minor" >= 0),
	CONSTRAINT "purchase_orders_fee_non_negative" CHECK ("purchase_orders"."fee_minor" >= 0),
	CONSTRAINT "purchase_orders_discount_within_subtotal" CHECK ("purchase_orders"."discount_minor" <= "purchase_orders"."subtotal_minor"),
	CONSTRAINT "purchase_orders_total_matches_components" CHECK ("purchase_orders"."total_paid_minor" = "purchase_orders"."subtotal_minor" - "purchase_orders"."discount_minor" + "purchase_orders"."shipping_minor" + "purchase_orders"."tax_minor" + "purchase_orders"."fee_minor")
);
--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_target_asset_id_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_acquisition_financial_event_id_financial_events_id_fk" FOREIGN KEY ("acquisition_financial_event_id") REFERENCES "public"."financial_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_relationships_source_idx" ON "asset_relationships" USING btree ("source_asset_id");--> statement-breakpoint
CREATE INDEX "asset_relationships_target_idx" ON "asset_relationships" USING btree ("target_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_relationships_unique" ON "asset_relationships" USING btree ("source_asset_id","target_asset_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_relationships_one_parent" ON "asset_relationships" USING btree ("source_asset_id") WHERE "asset_relationships"."type" = 'belongs_to';--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_sort_idx" ON "purchase_order_items" USING btree ("order_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_items_asset_unique" ON "purchase_order_items" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_items_financial_event_unique" ON "purchase_order_items" USING btree ("acquisition_financial_event_id") WHERE "purchase_order_items"."acquisition_financial_event_id" is not null;--> statement-breakpoint
CREATE INDEX "purchase_orders_ordered_on_idx" ON "purchase_orders" USING btree ("ordered_on");--> statement-breakpoint
CREATE INDEX "purchase_orders_order_number_idx" ON "purchase_orders" USING btree ("order_number");