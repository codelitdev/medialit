-- Better Auth 1.7.7 no longer reads or writes account.issuer (relaxed in 0003).
ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer";
