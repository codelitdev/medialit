import type { ApikeyRow } from "../db/types";
import { getUniqueId } from "@medialit/utils";
import getRepositories from "../config/repositories";

export type Apikey = ApikeyRow;

export async function createApiKey(
    userId: string,
    name: string,
    isDefault: boolean = false,
): Promise<Apikey> {
    return await getRepositories().apikeys.create({
        name,
        key: getUniqueId(),
        userId,
        default: isDefault,
    });
}

export async function getApiKeyUsingKeyId(key: string): Promise<Apikey | null> {
    return await getRepositories().apikeys.findByKey(key);
}

export async function getApiKeyByUserId(
    userId: string,
    keyId?: string,
): Promise<Apikey | Apikey[] | null> {
    if (keyId) {
        return await getRepositories().apikeys.findByUserIdAndKey(
            userId,
            keyId,
        );
    }

    return await getRepositories().apikeys.findManyByUserId(userId);
}

export default {
    createApiKey,
    getApiKeyUsingKeyId,
    getApiKeyByUserId,
};
