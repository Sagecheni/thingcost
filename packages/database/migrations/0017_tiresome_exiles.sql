CREATE TYPE "public"."subscription_price_change_kind" AS ENUM('initial', 'discount', 'price_change');--> statement-breakpoint
CREATE TABLE "subscription_price_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "subscription_price_change_kind" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"effective_on" date NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_price_changes_amount_non_negative" CHECK ("subscription_price_changes"."amount_minor" >= 0),
	CONSTRAINT "subscription_price_changes_discount_non_negative" CHECK ("subscription_price_changes"."discount_minor" >= 0),
	CONSTRAINT "subscription_price_changes_discount_not_above_amount" CHECK ("subscription_price_changes"."discount_minor" <= "subscription_price_changes"."amount_minor")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "discount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "discount_ends_on" date;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_renew" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_price_changes" ADD CONSTRAINT "subscription_price_changes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_price_changes_subscription_idx" ON "subscription_price_changes" USING btree ("subscription_id","effective_on");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_non_negative" CHECK ("subscriptions"."discount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_not_above_amount" CHECK ("subscriptions"."discount_minor" <= "subscriptions"."amount_minor");