CREATE TABLE "derivatives" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"bucket" text DEFAULT 'private' NOT NULL,
	"key" text,
	"mime_type" text,
	"size" bigint DEFAULT 0 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "derivatives_status_check" CHECK ("derivatives"."status" IN ('queued', 'processing', 'ready', 'failed')),
	CONSTRAINT "derivatives_bucket_check" CHECK ("derivatives"."bucket" IN ('private', 'public'))
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "processing_status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "processing_error" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "seal_claim" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "sealing_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "derivatives" ADD CONSTRAINT "derivatives_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "derivatives_media_name_uidx" ON "derivatives" USING btree ("media_id","name");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_processing_status_check" CHECK ("media"."processing_status" IN ('pending', 'processing', 'ready', 'failed'));