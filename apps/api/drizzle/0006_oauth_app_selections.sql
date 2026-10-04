CREATE TABLE "oauth_app_selections" (
	"session_id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_app_selections" ADD CONSTRAINT "oauth_app_selections_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_app_selections" ADD CONSTRAINT "oauth_app_selections_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;