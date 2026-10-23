-- Hashed, revocable API keys (docs/prds/apikey.md §5).
--
-- The old `api_keys` table was both the app (tenant) and its single plaintext
-- key, and every tenant table stored that plaintext key. This migration:
--   1. renames `api_keys` to `apps` (the tenant), keeping its IDs;
--   2. creates a new `api_keys` table holding only SHA-256 hashes;
--   3. turns each app's plaintext key into a hashed `legacy` key, so existing
--      integrations keep working;
--   4. re-keys media, media settings, signatures and TUS uploads to `apps.id`;
--   5. drops the plaintext key and the never-enforced restriction columns.
-- The migrator runs it inside one transaction, so any failure leaves the
-- database untouched.

ALTER TABLE "api_keys" RENAME TO "apps";
--> statement-breakpoint
ALTER TABLE "apps" RENAME COLUMN "key_id" TO "app_id";
--> statement-breakpoint
ALTER TABLE "oauth_app_selections" RENAME COLUMN "api_key_id" TO "app_id";
--> statement-breakpoint
-- Renaming a table keeps its constraint and index names. 0001 created them
-- implicitly, so look them up by what they constrain and give them the names
-- Drizzle expects; otherwise the new `api_keys` table would collide with them.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.conname, c.contype, a.attname
        FROM pg_constraint c
        LEFT JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.conrelid = 'public.apps'::regclass
    LOOP
        IF r.contype = 'p' AND r.conname <> 'apps_pkey' THEN
            EXECUTE format('ALTER TABLE "apps" RENAME CONSTRAINT %I TO %I', r.conname, 'apps_pkey');
        ELSIF r.contype = 'u' AND r.attname = 'app_id' AND r.conname <> 'apps_app_id_unique' THEN
            EXECUTE format('ALTER TABLE "apps" RENAME CONSTRAINT %I TO %I', r.conname, 'apps_app_id_unique');
        ELSIF r.contype = 'u' AND r.attname = 'key' THEN
            EXECUTE format('ALTER TABLE "apps" RENAME CONSTRAINT %I TO %I', r.conname, 'apps_key_unique');
        ELSIF r.contype = 'f' AND r.attname = 'user_id' AND r.conname <> 'apps_user_id_user_id_fk' THEN
            EXECUTE format('ALTER TABLE "apps" RENAME CONSTRAINT %I TO %I', r.conname, 'apps_user_id_user_id_fk');
        -- PostgreSQL 18+ records NOT NULL as named constraints too.
        ELSIF r.contype = 'n' AND r.conname <> 'apps_' || r.attname || '_not_null' THEN
            EXECUTE format('ALTER TABLE "apps" RENAME CONSTRAINT %I TO %I', r.conname, 'apps_' || r.attname || '_not_null');
        END IF;
    END LOOP;

    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'public.oauth_app_selections'::regclass
            AND c.contype = 'f'
            AND c.confrelid = 'public.apps'::regclass
            AND c.conname <> 'oauth_app_selections_app_id_apps_id_fk'
    LOOP
        EXECUTE format('ALTER TABLE "oauth_app_selections" RENAME CONSTRAINT %I TO %I', r.conname, 'oauth_app_selections_app_id_apps_id_fk');
    END LOOP;
END $$;
--> statement-breakpoint
ALTER INDEX IF EXISTS "api_keys_user_name_uidx" RENAME TO "apps_user_name_uidx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "api_keys_one_default_uidx" RENAME TO "apps_one_default_uidx";
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_type" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_api_key_id_unique" UNIQUE("api_key_id"),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "api_keys_created_by_type_check" CHECK ("api_keys"."created_by_type" IN ('user', 'bootstrap', 'legacy'))
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "api_keys_app_id_idx" ON "api_keys" USING btree ("app_id");
--> statement-breakpoint
-- Every existing plaintext key becomes a hashed `legacy` key on its app. Lookup
-- hashes whatever the client sends, so these keep authenticating unchanged.
-- Keys of deleted apps arrive already revoked.
INSERT INTO "api_keys" (
	"id", "api_key_id", "app_id", "name", "key_hash", "key_prefix",
	"revoked_at", "created_by_type", "created_at"
)
SELECT
	gen_random_uuid()::text,
	'ak_' || replace(gen_random_uuid()::text, '-', ''),
	"id",
	'Default key',
	encode(sha256(convert_to("key", 'UTF8')), 'hex'),
	left("key", 4),
	CASE WHEN "deleted" THEN now() ELSE NULL END,
	'legacy',
	"created_at"
FROM "apps";
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "app_id" text;
--> statement-breakpoint
UPDATE "media" AS m SET "app_id" = a."id" FROM "apps" AS a WHERE a."key" = m."apikey";
--> statement-breakpoint
ALTER TABLE "media_settings" ADD COLUMN "app_id" text;
--> statement-breakpoint
UPDATE "media_settings" AS s SET "app_id" = a."id" FROM "apps" AS a WHERE a."key" = s."apikey";
--> statement-breakpoint
-- Never drop media or settings silently: a row whose key matches no app needs
-- a person to look at it.
DO $$
DECLARE
    orphans bigint;
BEGIN
    SELECT count(*) INTO orphans FROM "media" WHERE "app_id" IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION '% media rows reference an API key that matches no app (media.apikey not found in api_keys.key). Fix or delete them, then upgrade again.', orphans;
    END IF;
    SELECT count(*) INTO orphans FROM "media_settings" WHERE "app_id" IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION '% media_settings rows reference an API key that matches no app (media_settings.apikey not found in api_keys.key). Fix or delete them, then upgrade again.', orphans;
    END IF;
END $$;
--> statement-breakpoint
-- Signatures last a day and TUS upload records a few days. An orphaned one
-- could never be used, so delete it rather than block the upgrade.
ALTER TABLE "signatures" ADD COLUMN "app_id" text;
--> statement-breakpoint
ALTER TABLE "signatures" ADD COLUMN "api_key_id" text;
--> statement-breakpoint
UPDATE "signatures" AS s SET "app_id" = a."id" FROM "apps" AS a WHERE a."key" = s."apikey";
--> statement-breakpoint
DELETE FROM "signatures" WHERE "app_id" IS NULL;
--> statement-breakpoint
-- The old schema can't tell key-minted signatures from dashboard ones, so tie
-- them all to the app's legacy key: revoking it then revokes them too.
UPDATE "signatures" AS s SET "api_key_id" = k."id" FROM "api_keys" AS k WHERE k."app_id" = s."app_id" AND k."created_by_type" = 'legacy';
--> statement-breakpoint
ALTER TABLE "tus_uploads" ADD COLUMN "app_id" text;
--> statement-breakpoint
UPDATE "tus_uploads" AS t SET "app_id" = a."id" FROM "apps" AS a WHERE a."key" = t."apikey";
--> statement-breakpoint
DELETE FROM "tus_uploads" WHERE "app_id" IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "media_owner_idx";
--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "apikey";
--> statement-breakpoint
ALTER TABLE "media_settings" DROP COLUMN "apikey";
--> statement-breakpoint
ALTER TABLE "signatures" DROP COLUMN "apikey";
--> statement-breakpoint
ALTER TABLE "tus_uploads" DROP COLUMN "apikey";
--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "app_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_settings" ALTER COLUMN "app_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "signatures" ALTER COLUMN "app_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tus_uploads" ALTER COLUMN "app_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_settings" ADD CONSTRAINT "media_settings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_settings" ADD CONSTRAINT "media_settings_app_id_unique" UNIQUE("app_id");
--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tus_uploads" ADD CONSTRAINT "tus_uploads_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "media_owner_idx" ON "media" USING btree ("user_id", "app_id", "temp");
--> statement-breakpoint
CREATE INDEX "signatures_api_key_id_idx" ON "signatures" USING btree ("api_key_id");
--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "key";
--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "restriction";
--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "http_referrers";
--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "ip_addresses";
