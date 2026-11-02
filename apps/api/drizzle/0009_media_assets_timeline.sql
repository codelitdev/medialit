ALTER TABLE "media" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "taken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "width" bigint;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "height" bigint;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "duration_ms" bigint;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "thumbnail_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media_settings" ADD COLUMN "private_thumbnails" boolean;--> statement-breakpoint
ALTER TABLE "media_settings" ADD COLUMN "thumbnail_fit" text;--> statement-breakpoint
CREATE UNIQUE INDEX "media_app_asset_uidx" ON "media" USING btree ("app_id","asset_id") WHERE "media"."asset_id" is not null;--> statement-breakpoint
CREATE INDEX "media_timeline_idx" ON "media" USING btree ("app_id","temp",coalesce("taken_at", "created_at") desc,"id" desc);