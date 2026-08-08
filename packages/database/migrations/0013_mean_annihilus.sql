ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_acquisition_financial_event_id_financial_events_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "asset_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "amount_minor" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "asset_name_snapshot" varchar(160);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "category_name_snapshot" varchar(120);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "status_name_snapshot" varchar(80);
--> statement-breakpoint
UPDATE "purchase_order_items" AS poi
SET
  "asset_name_snapshot" = a."name",
  "category_name_snapshot" = c."name",
  "status_name_snapshot" = s."name"
FROM "assets" AS a
INNER JOIN "categories" AS c ON c."id" = a."category_id"
INNER JOIN "asset_statuses" AS s ON s."id" = a."current_status_id"
WHERE poi."asset_id" = a."id";
--> statement-breakpoint
UPDATE "purchase_order_items"
SET
  "asset_name_snapshot" = COALESCE("asset_name_snapshot", '已删除物品'),
  "category_name_snapshot" = COALESCE("category_name_snapshot", '已删除分类'),
  "status_name_snapshot" = COALESCE("status_name_snapshot", '已删除状态');
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "asset_name_snapshot" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "category_name_snapshot" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "status_name_snapshot" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_acquisition_financial_event_id_financial_events_id_fk" FOREIGN KEY ("acquisition_financial_event_id") REFERENCES "public"."financial_events"("id") ON DELETE set null ON UPDATE no action;
