CREATE TYPE "public"."condition_grade" AS ENUM('new', 'like_new', 'good', 'fair', 'poor');--> statement-breakpoint
CREATE TYPE "public"."defect_type" AS ENUM('scratch', 'dent', 'crack', 'missing_part', 'functional_issue', 'stain', 'wear', 'repair_history', 'other');--> statement-breakpoint
CREATE TABLE "condition_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"condition_event_id" uuid NOT NULL,
	"type" "defect_type" NOT NULL,
	"description" varchar(500) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"grade" "condition_grade" NOT NULL,
	"observed_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"borrower" varchar(160) NOT NULL,
	"lent_on" date NOT NULL,
	"due_on" date,
	"returned_on" date,
	"note" text,
	"return_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_due_not_before_lent" CHECK ("loans"."due_on" is null or "loans"."due_on" >= "loans"."lent_on"),
	CONSTRAINT "loans_return_not_before_lent" CHECK ("loans"."returned_on" is null or "loans"."returned_on" >= "loans"."lent_on")
);
--> statement-breakpoint
CREATE TABLE "repairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"issue" varchar(500) NOT NULL,
	"provider" varchar(160),
	"sent_on" date NOT NULL,
	"completed_on" date,
	"cost_financial_event_id" uuid,
	"note" text,
	"completion_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repairs_completion_not_before_sent" CHECK ("repairs"."completed_on" is null or "repairs"."completed_on" >= "repairs"."sent_on")
);
--> statement-breakpoint
ALTER TABLE "condition_defects" ADD CONSTRAINT "condition_defects_condition_event_id_condition_events_id_fk" FOREIGN KEY ("condition_event_id") REFERENCES "public"."condition_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_events" ADD CONSTRAINT "condition_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_cost_financial_event_id_financial_events_id_fk" FOREIGN KEY ("cost_financial_event_id") REFERENCES "public"."financial_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "condition_defects_event_idx" ON "condition_defects" USING btree ("condition_event_id");--> statement-breakpoint
CREATE INDEX "condition_events_asset_date_idx" ON "condition_events" USING btree ("asset_id","observed_on","created_at");--> statement-breakpoint
CREATE INDEX "loans_asset_lent_on_idx" ON "loans" USING btree ("asset_id","lent_on");--> statement-breakpoint
CREATE UNIQUE INDEX "loans_one_open_per_asset" ON "loans" USING btree ("asset_id") WHERE "loans"."returned_on" is null;--> statement-breakpoint
CREATE INDEX "repairs_asset_sent_on_idx" ON "repairs" USING btree ("asset_id","sent_on");--> statement-breakpoint
CREATE UNIQUE INDEX "repairs_one_open_per_asset" ON "repairs" USING btree ("asset_id") WHERE "repairs"."completed_on" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "repairs_financial_event_unique" ON "repairs" USING btree ("cost_financial_event_id") WHERE "repairs"."cost_financial_event_id" is not null;--> statement-breakpoint
CREATE INDEX "asset_tags_tag_id_idx" ON "asset_tags" USING btree ("tag_id");