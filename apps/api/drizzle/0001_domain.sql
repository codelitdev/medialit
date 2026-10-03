CREATE TABLE IF NOT EXISTS "profiles" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "public_user_id" text NOT NULL UNIQUE,
  "active" boolean NOT NULL DEFAULT true,
  "customer_id" text UNIQUE,
  "subscription_id" text UNIQUE,
  "subscription_ends_after" timestamptz,
  "subscription_method" text,
  "subscription_status" text NOT NULL DEFAULT 'not-subscribed'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" text PRIMARY KEY,
  "key_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "key" text NOT NULL UNIQUE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "restriction" text,
  "http_referrers" text[] NOT NULL DEFAULT '{}',
  "ip_addresses" text[] NOT NULL DEFAULT '{}',
  "deleted" boolean NOT NULL DEFAULT false,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_user_name_uidx" ON "api_keys" ("user_id", "name") WHERE "deleted" = false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_one_default_uidx" ON "api_keys" ("user_id") WHERE "is_default" = true AND "deleted" = false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media" (
  "id" text PRIMARY KEY,
  "file_name" text NOT NULL,
  "media_id" text NOT NULL UNIQUE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "apikey" text NOT NULL,
  "original_file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size" bigint NOT NULL,
  "thumbnail_generated" boolean NOT NULL DEFAULT false,
  "access_control" text NOT NULL DEFAULT 'private',
  "group_name" text,
  "caption" text,
  "temp" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_owner_idx" ON "media" ("user_id", "apikey", "temp");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_settings" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "apikey" text NOT NULL UNIQUE,
  "use_web_p" boolean,
  "webp_output_quality" bigint,
  "thumbnail_width" bigint,
  "thumbnail_height" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signatures" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "apikey" text NOT NULL,
  "signature" text NOT NULL UNIQUE,
  "valid_till" timestamptz NOT NULL,
  "group_name" text,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tus_uploads" (
  "id" text PRIMARY KEY,
  "upload_id" text NOT NULL UNIQUE,
  "user_id" text NOT NULL,
  "apikey" text NOT NULL,
  "upload_length" bigint NOT NULL,
  "upload_offset" bigint NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL,
  "temp_file_path" text,
  "signature" text,
  "is_complete" boolean NOT NULL DEFAULT false,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_revoked_tokens" (
  "jti" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "client_id" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz NOT NULL
);
