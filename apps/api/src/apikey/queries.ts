import { Apikey } from "@medialit/models";
import {
    createApiKey as insertApiKey,
    getApiKeyBySecret,
    listApiKeys,
} from "@/db";

export async function createApiKey(
    userId: string,
    name: string,
    isDefault: boolean = false,
): Promise<Apikey> {
    const created = await insertApiKey({ userId, name, isDefault });
    return created;
}

export async function getApiKeyUsingKeyId(key: string): Promise<Apikey | null> {
    return getApiKeyBySecret(key);
}

export async function getApiKeyByUserId(
    userId: string,
    keyId?: string,
): Promise<Apikey | Apikey[] | null> {
    const rows = await listApiKeys(userId, keyId);
    if (keyId) return rows[0] ?? null;
    return rows;
}

export default {
    createApiKey,
    getApiKeyUsingKeyId,
    getApiKeyByUserId,
};
