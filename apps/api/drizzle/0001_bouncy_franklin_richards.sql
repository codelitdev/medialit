ALTER TABLE "tus_uploads" ALTER COLUMN "metadata" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tus_uploads" ALTER COLUMN "temp_file_path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tus_uploads" ALTER COLUMN "is_complete" SET NOT NULL;