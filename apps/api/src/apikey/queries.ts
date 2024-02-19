import { Apikey } from "@medialit/models";
import ApikeyModel from "./model";
import { getUniqueId } from "@medialit/utils";

export async function createApiKey(
    userId: string,
    name: string
): Promise<Apikey> {
    return await ApikeyModel.create({
        name,
        key: getUniqueId(),
        userId,
    });
}

export async function getApiKeyUsingKeyId(key: string): Promise<Apikey | null> {
    return await ApikeyModel.findOne({ key });
}

export async function getApiKeyByUserId(
    userId: string,
    keyId?: string
): Promise<Apikey | Apikey[] | null> {
    let result: Apikey | Apikey[] | null;
    const projections = {
        _id: 0,
        name: 1,
        key: 1,
        httpReferrers: 1,
        ipAddresses: 1,
        createdAt: 1,
        updatedAt: 1,
    };
    if (keyId) {
        result = await ApikeyModel.findOne(
            {
                key: keyId,
                userId,
                internal: false,
            },
            projections
        );
    } else {
        result = await ApikeyModel.find(
            { userId, internal: false },
            projections
        );
    }

    return result;
}

export async function deleteApiKey(
    userId: string,
    keyId: string
): Promise<void> {
    await ApikeyModel.deleteOne({
        key: keyId,
        userId,
    });
}

export default {
    createApiKey,
    getApiKeyUsingKeyId,
    getApiKeyByUserId,
    deleteApiKey,
};
