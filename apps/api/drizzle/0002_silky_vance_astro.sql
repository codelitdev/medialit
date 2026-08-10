ALTER TABLE "tus_uploads" ALTER COLUMN "metadata" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tus_uploads" ALTER COLUMN "temp_file_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "logs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "oauth_pending_auths_expires_at_idx" ON "oauth_pending_auths" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_revoked_tokens_expires_at_idx" ON "oauth_revoked_tokens" USING btree ("expires_at");