import {
    findApiKeyForAuth,
    insertApiKey,
    touchApiKeyLastUsed,
    type ApiKeyAuthRecord,
    type ApiKeyRecord,
} from "@/db";
import {
    displayPrefix,
    generateApiKeySecret,
    hashApiKeySecret,
} from "./secret";

/** Most active keys an app can have. Bootstrap keys skip the check but count
 * toward it. */
export const MAX_ACTIVE_API_KEYS_PER_APP = 10;

/**
 * Creates a key for the app and returns its secret. The secret is never stored
 * or returned again; only its hash and display prefix are kept.
 */
export async function createApiKey(input: {
    /** Internal app ID. */
    appId: string;
    name: string;
    createdById?: string;
    expiresAt?: Date;
}): Promise<{ apiKey: ApiKeyRecord; secret: string }> {
    const secret = generateApiKeySecret();
    const apiKey = await insertApiKey({
        appId: input.appId,
        name: input.name,
        keyHash: hashApiKeySecret(secret),
        keyPrefix: displayPrefix(secret),
        createdByType: "user",
        createdById: input.createdById,
        expiresAt: input.expiresAt,
        limit: MAX_ACTIVE_API_KEYS_PER_APP,
    });
    return { apiKey, secret };
}

/**
 * Resolves a submitted secret to its key, app and owner state, or `null` if
 * no usable key matches. Records the use without delaying the request.
 */
export async function getApiKeyBySecret(
    secret: string,
): Promise<ApiKeyAuthRecord | null> {
    const found = await findApiKeyForAuth(hashApiKeySecret(secret));
    if (found) {
        touchApiKeyLastUsed(found.key.id).catch(() => undefined);
    }
    return found;
}
