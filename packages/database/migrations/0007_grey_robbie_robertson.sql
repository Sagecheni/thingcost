ALTER TABLE "purchase_orders" ADD COLUMN "base_total_paid_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "base_currency" char(3) DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "exchange_rate" numeric(24, 12) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "exchange_rate_source" varchar(40) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "exchange_rate_date" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "exchange_rate_fallback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "purchase_orders" SET "base_total_paid_minor" = "total_paid_minor", "base_currency" = "currency", "exchange_rate_date" = "ordered_on";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_base_total_non_negative" CHECK ("purchase_orders"."base_total_paid_minor" >= 0);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_exchange_rate_positive" CHECK ("purchase_orders"."exchange_rate" > 0);