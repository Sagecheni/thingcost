CREATE TYPE "public"."valuation_schedule_cadence" AS ENUM('manual', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."valuation_trigger_source" AS ENUM('manual', 'schedule', 'retry');--> statement-breakpoint
CREATE TABLE "valuation_schedules" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"cadence" "valuation_schedule_cadence" DEFAULT 'manual' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_report_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuation_search_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" char(64) NOT NULL,
	"query_text" varchar(500) NOT NULL,
	"results_json" text NOT NULL,
	"provider" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "valuation_reports" ADD COLUMN "trigger_source" "valuation_trigger_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "valuation_reports" ADD COLUMN "search_cache_hit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "valuation_reports" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "valuation_schedules" ADD CONSTRAINT "valuation_schedules_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_schedules" ADD CONSTRAINT "valuation_schedules_last_report_id_valuation_reports_id_fk" FOREIGN KEY ("last_report_id") REFERENCES "public"."valuation_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "valuation_schedules_due_idx" ON "valuation_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "valuation_search_cache_query_unique" ON "valuation_search_cache" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "valuation_search_cache_expires_idx" ON "valuation_search_cache" USING btree ("expires_at");