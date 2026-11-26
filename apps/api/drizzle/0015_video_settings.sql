CREATE TABLE "processing_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"media_id" text,
	"job_id" text NOT NULL,
	"kind" text NOT NULL,
	"minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_usage_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "media_settings" ADD COLUMN "video_streaming" text;--> statement-breakpoint
ALTER TABLE "media_settings" ADD COLUMN "hls_renditions" text[];--> statement-breakpoint
ALTER TABLE "processing_usage" ADD CONSTRAINT "processing_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_usage" ADD CONSTRAINT "processing_usage_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processing_usage_user_created_idx" ON "processing_usage" USING btree ("user_id","created_at");--> statement-breakpoint
-- Apps that exist before video streaming keep today's processing: "off".
-- New apps get null, which means the account plan's default.
UPDATE "media_settings" SET "video_streaming" = 'off';--> statement-breakpoint
INSERT INTO "media_settings" ("id", "user_id", "app_id", "video_streaming")
SELECT gen_random_uuid()::text, a."user_id", a."id", 'off'
FROM "apps" a
WHERE NOT a."deleted"
AND NOT EXISTS (SELECT 1 FROM "media_settings" s WHERE s."app_id" = a."id");
