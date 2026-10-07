-- Better Auth 1.7.7 no longer writes account.issuer. Preserve existing values.
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
