-- Subscriptions live in the billing tables (@codelitdev/billing). Dropping a
-- column also drops its unique constraint, whatever its name.
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "customer_id";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "subscription_id";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "subscription_ends_after";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "subscription_method";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "subscription_status";
