/**
 * Standard Webhooks signing (https://www.standardwebhooks.com/). The signed
 * content is `${webhook-id}.${webhook-timestamp}.${body}`, signed with
 * HMAC-SHA256 using the base64-decoded part of the secret after `whsec_`.
 */
import { createHmac, randomBytes } from "node:crypto";

const SECRET_PREFIX = "whsec_";

/** A new signing secret: `whsec_` and 24 random bytes in base64. */
export function generateSecret(): string {
    return `${SECRET_PREFIX}${randomBytes(24).toString("base64")}`;
}

function secretKey(secret: string): Buffer {
    const encoded = secret.startsWith(SECRET_PREFIX)
        ? secret.slice(SECRET_PREFIX.length)
        : secret;
    return Buffer.from(encoded, "base64");
}

/** The `webhook-signature` header value: `v1,` and the base64 HMAC. */
export function sign(input: {
    secret: string;
    id: string;
    timestamp: number;
    body: string;
}): string {
    const signature = createHmac("sha256", secretKey(input.secret))
        .update(`${input.id}.${input.timestamp}.${input.body}`)
        .digest("base64");
    return `v1,${signature}`;
}

/** The three Standard Webhooks headers for one attempt. The timestamp is
 * the attempt's, in seconds; the ID stays the same across retries. */
export function signedHeaders(input: {
    secret: string;
    id: string;
    body: string;
    now?: Date;
}): Record<string, string> {
    const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1000);
    return {
        "webhook-id": input.id,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": sign({
            secret: input.secret,
            id: input.id,
            timestamp,
            body: input.body,
        }),
    };
}
