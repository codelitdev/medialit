import { createHash, randomBytes } from "node:crypto";

/** Stripe-style prefix: secret scanners can spot leaked MediaLit keys, and the
 * credential type is obvious at a glance. */
export const API_KEY_PREFIX = "ml_live_";

/** Characters of a key shown in lists (`ml_live_a1b2`). */
const DISPLAY_PREFIX_LENGTH = 12;

/** 32 CSPRNG bytes, 256 bits of entropy, base64url so the key stays URL and
 * copy-paste safe. */
export function generateApiKeySecret(): string {
    return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/**
 * Keys are stored as a plain SHA-256 hash. A slow hash or a pepper only
 * protects guessable secrets; a 256-bit random key can't be brute-forced from
 * its hash, and a fast hash keeps every authenticated request cheap. See
 * docs/prds/apikey.md §13.
 */
export function hashApiKeySecret(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function displayPrefix(secret: string): string {
    return secret.slice(0, DISPLAY_PREFIX_LENGTH);
}
