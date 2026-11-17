ALTER TABLE "tus_uploads" ADD COLUMN "media_id" text;--> statement-breakpoint
ALTER TABLE "tus_uploads" DROP COLUMN "upload_offset";--> statement-breakpoint
ALTER TABLE "tus_uploads" DROP COLUMN "temp_file_path";