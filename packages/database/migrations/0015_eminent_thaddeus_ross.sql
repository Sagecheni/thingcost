ALTER TABLE "assets" ADD COLUMN "serial_number" varchar(160);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "purchase_channel" varchar(160);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "order_number" varchar(160);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "warranty_start_date" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "warranty_end_date" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "extended_warranty_end_date" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "extended_warranty_provider" varchar(160);