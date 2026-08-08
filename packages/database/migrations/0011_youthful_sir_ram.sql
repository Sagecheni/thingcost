CREATE TYPE "public"."subscription_billing_cycle" AS ENUM('monthly', 'yearly', 'custom', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."subscription_charge_kind" AS ENUM('planned', 'actual');--> statement-breakpoint
CREATE TYPE "public"."subscription_charge_status" AS ENUM('planned', 'succeeded', 'failed', 'refunded', 'waived');--> statement-breakpoint
CREATE TYPE "public"."subscription_kind" AS ENUM('subscription', 'digital_license');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'paused', 'cancelled', 'expired');--> statement-breakpoint
ALTER TYPE "public"."notification_provider" ADD VALUE 'wecom';--> statement-breakpoint
ALTER TYPE "public"."notification_provider" ADD VALUE 'serverchan';--> statement-breakpoint
CREATE TABLE "subscription_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "subscription_charge_kind" NOT NULL,
	"status" "subscription_charge_status" DEFAULT 'planned' NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_charges_amount_non_negative" CHECK ("subscription_charges"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "subscription_kind" DEFAULT 'subscription' NOT NULL,
	"name" varchar(160) NOT NULL,
	"vendor" varchar(120),
	"category_label" varchar(80),
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"billing_cycle" "subscription_billing_cycle" NOT NULL,
	"custom_interval_days" integer,
	"currency" char(3) DEFAULT 'CNY' NOT NULL,
	"amount_minor" bigint DEFAULT 0 NOT NULL,
	"seats" integer,
	"started_on" date,
	"trial_ends_on" date,
	"next_billing_on" date,
	"cancelled_on" date,
	"expires_on" date,
	"account_hint" varchar(160),
	"password_manager_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "subscriptions_amount_non_negative" CHECK ("subscriptions"."amount_minor" >= 0),
	CONSTRAINT "subscriptions_custom_interval_positive" CHECK ("subscriptions"."custom_interval_days" is null or "subscriptions"."custom_interval_days" > 0),
	CONSTRAINT "subscriptions_seats_positive" CHECK ("subscriptions"."seats" is null or "subscriptions"."seats" > 0)
);
--> statement-breakpoint
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_charges_subscription_idx" ON "subscription_charges" USING btree ("subscription_id","occurred_on");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status","next_billing_on");--> statement-breakpoint
CREATE INDEX "subscriptions_kind_idx" ON "subscriptions" USING btree ("kind");