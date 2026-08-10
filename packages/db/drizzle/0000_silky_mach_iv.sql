CREATE TABLE "apikeys" (
	"id" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"restriction" text,
	"http_referrers" text[],
	"ip_addresses" text[],
	"deleted" boolean DEFAULT false NOT NULL,
	"default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apikeys_key_id_unique" UNIQUE("key_id"),
	CONSTRAINT "apikeys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" text PRIMARY KEY NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"media_id" text NOT NULL,
	"user_id" text NOT NULL,
	"apikey" text NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"thumbnail_generated" boolean DEFAULT false NOT NULL,
	"access_control" text DEFAULT 'private' NOT NULL,
	"group_name" text,
	"caption" text,
	"temp" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"apikey" text NOT NULL,
	"use_webp" boolean,
	"webp_output_quality" integer,
	"thumbnail_width" integer,
	"thumbnail_height" integer,
	CONSTRAINT "media_settings_apikey_unique" UNIQUE("apikey")
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_id_issued_at" bigint NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"grant_types" text[] NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"client_name" text,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_pending_auths" (
	"id" text PRIMARY KEY NOT NULL,
	"pending_id" text NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text,
	"code_challenge_method" text,
	"state" text,
	"scope" text,
	"email" text,
	"otp_hash" text,
	"otp_expires" timestamp with time zone,
	"otp_attempts" integer DEFAULT 0,
	"otp_sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_pending_auths_pending_id_unique" UNIQUE("pending_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_revoked_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"jti" text NOT NULL,
	"token_type" text DEFAULT 'refresh_token' NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_revoked_tokens_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"max_file_size" bigint NOT NULL,
	"max_storage" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presigned_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"apikey" text NOT NULL,
	"signature" text NOT NULL,
	"valid_till" timestamp with time zone NOT NULL,
	"group_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tus_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"upload_id" text NOT NULL,
	"user_id" text NOT NULL,
	"apikey" text NOT NULL,
	"upload_length" bigint NOT NULL,
	"upload_offset" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"temp_file_path" text,
	"is_complete" boolean DEFAULT false,
	"expires_at" timestamp with time zone,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tus_uploads_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"name" text,
	"customer_id" text,
	"subscription_id" text,
	"subscription_ends_after" timestamp with time zone,
	"subscription_method" text,
	"subscription_status" text DEFAULT 'not-subscribed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "users_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "apikeys_name_user_id_idx" ON "apikeys" USING btree ("name","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apikeys_default_user_id_idx" ON "apikeys" USING btree ("user_id","default") WHERE "apikeys"."default" = true and "apikeys"."deleted" = false;