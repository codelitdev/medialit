CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_provider_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"scopes" text[] NOT NULL,
	"confirmation" jsonb,
	CONSTRAINT "oauth_provider_access_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_provider_client_assertions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_provider_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"user_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"token_endpoint_auth_method" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_provider_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_provider_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_provider_refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_provider_refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_access_tokens" ADD CONSTRAINT "oauth_provider_access_tokens_client_id_oauth_provider_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_provider_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_access_tokens" ADD CONSTRAINT "oauth_provider_access_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_access_tokens" ADD CONSTRAINT "oauth_provider_access_tokens_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_access_tokens" ADD CONSTRAINT "oauth_provider_access_tokens_refresh_id_oauth_provider_refresh_tokens_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_provider_refresh_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_clients" ADD CONSTRAINT "oauth_provider_clients_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_consents" ADD CONSTRAINT "oauth_provider_consents_client_id_oauth_provider_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_provider_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_consents" ADD CONSTRAINT "oauth_provider_consents_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_refresh_tokens" ADD CONSTRAINT "oauth_provider_refresh_tokens_client_id_oauth_provider_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_provider_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_refresh_tokens" ADD CONSTRAINT "oauth_provider_refresh_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_provider_refresh_tokens" ADD CONSTRAINT "oauth_provider_refresh_tokens_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "oauth_provider_access_tokens_client_id_idx" ON "oauth_provider_access_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_access_tokens_session_id_idx" ON "oauth_provider_access_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_access_tokens_user_id_idx" ON "oauth_provider_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_access_tokens_refresh_id_idx" ON "oauth_provider_access_tokens" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_clients_user_id_idx" ON "oauth_provider_clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_consents_client_id_idx" ON "oauth_provider_consents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_consents_user_id_idx" ON "oauth_provider_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_refresh_tokens_client_id_idx" ON "oauth_provider_refresh_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_refresh_tokens_session_id_idx" ON "oauth_provider_refresh_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_provider_refresh_tokens_user_id_idx" ON "oauth_provider_refresh_tokens" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "auth_users" ("id", "name", "email", "email_verified", "created_at", "updated_at")
SELECT
    "id",
    COALESCE(NULLIF("name", ''), "email"),
    "email",
    true,
    "created_at",
    "updated_at"
FROM "users"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "oauth_provider_clients" (
    "id", "client_id", "scopes", "redirect_uris", "token_endpoint_auth_method",
    "grant_types", "response_types", "public", "require_pkce", "name",
    "created_at", "updated_at"
)
SELECT
    'legacy-' || "id",
    "client_id",
    CASE
        WHEN COALESCE(TRIM("scope"), '') = '' THEN ARRAY['openid', 'profile', 'email', 'offline_access']::text[]
        ELSE regexp_split_to_array(TRIM("scope"), '\\s+')
    END,
    "redirect_uris",
    "token_endpoint_auth_method",
    "grant_types",
    ARRAY['code']::text[],
    true,
    true,
    "client_name",
    "created_at",
    "updated_at"
FROM "oauth_clients"
ON CONFLICT ("client_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "oauth_provider_clients" (
    "id", "client_id", "name", "scopes", "redirect_uris", "token_endpoint_auth_method",
    "grant_types", "response_types", "public", "require_pkce", "skip_consent", "created_at", "updated_at"
)
VALUES (
    'medialit-mobile-app',
    'mobile-app',
    'MediaLit mobile app',
    ARRAY['openid', 'profile', 'email', 'offline_access']::text[],
    ARRAY['medialit://oauth/callback']::text[],
    'none',
    ARRAY['authorization_code', 'refresh_token']::text[],
    ARRAY['code']::text[],
    true,
    true,
    false,
    now(),
    now()
)
ON CONFLICT ("client_id") DO NOTHING;
