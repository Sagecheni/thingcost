CREATE TYPE "public"."notification_provider" AS ENUM('telegram', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel_mode" AS ENUM('default', 'override', 'none');--> statement-breakpoint
CREATE TYPE "public"."reminder_delivery_kind" AS ENUM('lead', 'repeat', 'snooze');--> statement-breakpoint
CREATE TYPE "public"."reminder_delivery_status" AS ENUM('queued', 'processing', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reminder_frequency" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('general', 'warranty_expiry', 'maintenance', 'loan_return', 'renewal');--> statement-breakpoint
CREATE TYPE "public"."reminder_occurrence_status" AS ENUM('pending', 'acknowledged', 'dismissed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."reminder_recurrence_kind" AS ENUM('once', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reminder_task_mode" AS ENUM('notification', 'actionable');--> statement-breakpoint
CREATE TYPE "public"."reminder_trigger_mode" AS ENUM('date', 'datetime');--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "notification_provider" NOT NULL,
	"name" varchar(120) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"configuration_ciphertext" text NOT NULL,
	"configuration_iv" varchar(64) NOT NULL,
	"configuration_tag" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"channel_key" varchar(120) NOT NULL,
	"provider" "notification_provider" NOT NULL,
	"kind" "reminder_delivery_kind" NOT NULL,
	"dedupe_key" varchar(300) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "reminder_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 4 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(160),
	"last_error" varchar(1000),
	"http_status" integer,
	"response_excerpt" varchar(500),
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_deliveries_attempt_non_negative" CHECK ("reminder_deliveries"."attempt_count" >= 0),
	CONSTRAINT "reminder_deliveries_max_attempts_positive" CHECK ("reminder_deliveries"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "reminder_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "reminder_occurrence_status" DEFAULT 'pending' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"snooze_count" integer DEFAULT 0 NOT NULL,
	"repeat_count" integer DEFAULT 0 NOT NULL,
	"last_notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_occurrences_sequence_non_negative" CHECK ("reminder_occurrences"."sequence" >= 0),
	CONSTRAINT "reminder_occurrences_snooze_non_negative" CHECK ("reminder_occurrences"."snooze_count" >= 0),
	CONSTRAINT "reminder_occurrences_repeat_non_negative" CHECK ("reminder_occurrences"."repeat_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid,
	"kind" "reminder_kind" DEFAULT 'general' NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"trigger_mode" "reminder_trigger_mode" NOT NULL,
	"anchor_date" date NOT NULL,
	"anchor_time" char(5) NOT NULL,
	"anchor_at" timestamp with time zone NOT NULL,
	"time_zone" varchar(100) NOT NULL,
	"recurrence_kind" "reminder_recurrence_kind" NOT NULL,
	"frequency" "reminder_frequency",
	"recurrence_interval" integer,
	"ends_on" date,
	"occurrence_limit" integer,
	"lead_minutes" integer[] DEFAULT array[0]::integer[] NOT NULL,
	"task_mode" "reminder_task_mode" DEFAULT 'notification' NOT NULL,
	"repeat_interval_minutes" integer DEFAULT 1440 NOT NULL,
	"max_repeats" integer DEFAULT 0 NOT NULL,
	"channel_mode" "reminder_channel_mode" DEFAULT 'default' NOT NULL,
	"channel_keys" text[] DEFAULT array[]::text[] NOT NULL,
	"status" "reminder_status" DEFAULT 'active' NOT NULL,
	"next_sequence" integer DEFAULT 0 NOT NULL,
	"next_occurrence_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_anchor_time_format" CHECK ("reminders"."anchor_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "reminders_recurrence_fields" CHECK (("reminders"."recurrence_kind" = 'once' and "reminders"."frequency" is null and "reminders"."recurrence_interval" is null) or ("reminders"."recurrence_kind" = 'recurring' and "reminders"."frequency" is not null and "reminders"."recurrence_interval" > 0 and ("reminders"."ends_on" is not null or "reminders"."occurrence_limit" is not null))),
	CONSTRAINT "reminders_occurrence_limit_positive" CHECK ("reminders"."occurrence_limit" is null or "reminders"."occurrence_limit" > 0),
	CONSTRAINT "reminders_repeat_interval_positive" CHECK ("reminders"."repeat_interval_minutes" >= 10),
	CONSTRAINT "reminders_max_repeats_range" CHECK ("reminders"."max_repeats" between 0 and 20),
	CONSTRAINT "reminders_notification_has_no_repeats" CHECK ("reminders"."task_mode" <> 'notification' or "reminders"."max_repeats" = 0),
	CONSTRAINT "reminders_override_has_channels" CHECK ("reminders"."channel_mode" <> 'override' or cardinality("reminders"."channel_keys") > 0),
	CONSTRAINT "reminders_non_override_has_no_channels" CHECK ("reminders"."channel_mode" = 'override' or cardinality("reminders"."channel_keys") = 0),
	CONSTRAINT "reminders_next_sequence_non_negative" CHECK ("reminders"."next_sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_occurrence_id_reminder_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."reminder_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_channels_provider_idx" ON "notification_channels" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "notification_channels_default_idx" ON "notification_channels" USING btree ("enabled","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_deliveries_dedupe_unique" ON "reminder_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "reminder_deliveries_claim_idx" ON "reminder_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "reminder_deliveries_occurrence_idx" ON "reminder_deliveries" USING btree ("occurrence_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_occurrences_sequence_unique" ON "reminder_occurrences" USING btree ("reminder_id","sequence");--> statement-breakpoint
CREATE INDEX "reminder_occurrences_due_idx" ON "reminder_occurrences" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "reminders_asset_idx" ON "reminders" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "reminders_expansion_idx" ON "reminders" USING btree ("status","next_occurrence_at");