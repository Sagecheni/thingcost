CREATE TABLE "personal_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"token_prefix" varchar(16) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"scopes" text[] DEFAULT array[]::text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_access_tokens_scopes_not_empty" CHECK (cardinality("personal_access_tokens"."scopes") > 0)
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "personal_api_tokens_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_access_tokens_hash_unique" ON "personal_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "personal_access_tokens_admin_idx" ON "personal_access_tokens" USING btree ("admin_id","created_at");