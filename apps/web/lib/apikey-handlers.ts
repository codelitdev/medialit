import type { Apikey } from "@medialit/models";
import { type PublicApikey, webApi } from "./api";

export function getApiKeys(): Promise<PublicApikey[]> {
    return webApi.listApiKeys();
}

export function getApikeyFromKeyId(keyId: string): Promise<Apikey> {
    return webApi.getApiKey(keyId);
}

export function createApiKey(name: string): Promise<Apikey> {
    return webApi.createApiKey(name);
}

export function deleteApiKey(keyId: string): Promise<void> {
    return webApi.deleteApiKey(keyId);
}

export function editApiKey({
    keyId,
    newName,
}: {
    keyId: string;
    newName: string;
}): Promise<void> {
    return webApi.renameApiKey(keyId, newName);
}
