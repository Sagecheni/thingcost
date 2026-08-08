ALTER TABLE "financial_events" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "lifecycle_events" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lifecycle_events" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "lifecycle_events" ADD COLUMN "correction_of_id" uuid;