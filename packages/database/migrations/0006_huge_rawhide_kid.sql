ALTER TABLE "financial_events" ADD COLUMN "exchange_rate" numeric(24, 12) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_events" ADD COLUMN "exchange_rate_source" varchar(40) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_events" ADD COLUMN "exchange_rate_date" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_events" ADD COLUMN "exchange_rate_fallback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "financial_events" SET "exchange_rate_date" = "occurred_on";--> statement-breakpoint
ALTER TABLE "financial_events" ADD CONSTRAINT "financial_events_exchange_rate_positive" CHECK ("financial_events"."exchange_rate" > 0);