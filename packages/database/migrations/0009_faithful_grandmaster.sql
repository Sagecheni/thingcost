CREATE TYPE "public"."valuation_ai_protocol" AS ENUM('chat_completions', 'responses');--> statement-breakpoint
CREATE TYPE "public"."valuation_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."valuation_report_status" AS ENUM('queued', 'running', 'ready', 'adopted', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "valuation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" "valuation_report_status" DEFAULT 'queued' NOT NULL,
	"currency" char(3) NOT NULL,
	"low_minor" bigint,
	"mid_minor" bigint,
	"high_minor" bigint,
	"confidence" "valuation_confidence",
	"summary" text,
	"evidence_json" text DEFAULT '[]' NOT NULL,
	"forecasts_json" text DEFAULT '[]' NOT NULL,
	"outbound_summary_json" text NOT NULL,
	"search_provider" varchar(80),
	"ai_provider" varchar(80),
	"ai_protocol" "valuation_ai_protocol",
	"ai_model" varchar(160),
	"error_code" varchar(80),
	"error_message" varchar(1000),
	"adopted_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "valuation_reports_range_order" CHECK ("valuation_reports"."low_minor" is null or "valuation_reports"."mid_minor" is null or "valuation_reports"."high_minor" is null or ("valuation_reports"."low_minor" <= "valuation_reports"."mid_minor" and "valuation_reports"."mid_minor" <= "valuation_reports"."high_minor")),
	CONSTRAINT "valuation_reports_amounts_non_negative" CHECK (("valuation_reports"."low_minor" is null or "valuation_reports"."low_minor" >= 0) and ("valuation_reports"."mid_minor" is null or "valuation_reports"."mid_minor" >= 0) and ("valuation_reports"."high_minor" is null or "valuation_reports"."high_minor" >= 0))
);
--> statement-breakpoint
CREATE TABLE "valuation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"report_id" uuid,
	"currency" char(3) NOT NULL,
	"value_minor" bigint NOT NULL,
	"low_minor" bigint,
	"high_minor" bigint,
	"confidence" "valuation_confidence",
	"valued_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valuation_snapshots_value_non_negative" CHECK ("valuation_snapshots"."value_minor" >= 0),
	CONSTRAINT "valuation_snapshots_range_non_negative" CHECK (("valuation_snapshots"."low_minor" is null or "valuation_snapshots"."low_minor" >= 0) and ("valuation_snapshots"."high_minor" is null or "valuation_snapshots"."high_minor" >= 0))
);
--> statement-breakpoint
ALTER TABLE "valuation_reports" ADD CONSTRAINT "valuation_reports_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_snapshots" ADD CONSTRAINT "valuation_snapshots_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_snapshots" ADD CONSTRAINT "valuation_snapshots_report_id_valuation_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."valuation_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "valuation_reports_asset_created_idx" ON "valuation_reports" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "valuation_reports_status_idx" ON "valuation_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "valuation_snapshots_asset_valued_idx" ON "valuation_snapshots" USING btree ("asset_id","valued_on");