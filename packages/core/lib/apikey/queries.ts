import getUniqueId from '../utils/unique-id';
import ApikeyModel, { Apikey } from './model';

export async function createApiKey(userId: string): Promise<Apikey> {
    return await ApikeyModel.create({
        key: getUniqueId(),
        userId 
    });
}

export async function getApiKeyUsingKeyId(key: string): Promise<Apikey | null> {
    return await ApikeyModel.findOne({ key });
}

export async function getApiKey(userId: string, keyId?: string): Promise<Apikey | null> {
    let result: Apikey | null;
    const projections = {
        _id: 0,
        key: 1,
        httpReferrers: 1,
        ipAddresses: 1,
        createdAt: 1,
        updatedAt: 1
    }
    if (keyId) {
        result = await ApikeyModel.findOne({
            key: keyId,
            userId
        }, projections);
    } else {
        result = await ApikeyModel.findOne({ userId }, projections);
    }

    return result;
}

export async function deleteApiKey(userId: string, keyId: string): Promise<void> {
    await ApikeyModel.deleteOne({
        key: keyId,
        userId 
    });
}