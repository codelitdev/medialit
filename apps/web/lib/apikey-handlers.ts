import { Apikey } from "@medialit/models";
import ApikeyModel from "@/models/apikey";
import { getUniqueId } from "@medialit/utils";
import mongoose from "mongoose";

export async function getApiKeyByUserId(
    userId: mongoose.Types.ObjectId,
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
                deleted: { $ne: true },
            },
            projections
        );
    } else {
        result = await ApikeyModel.find(
            { userId, internal: false, deleted: { $ne: true } },
            projections
        );
    }
    return result;
}

export async function createApiKey(
    userId: mongoose.Types.ObjectId,
    name: string
): Promise<Apikey> {
    return await ApikeyModel.create({
        name,
        key: getUniqueId(),
        userId,
    });
}

export async function deleteApiKey(
    userId: mongoose.Types.ObjectId,
    name: string
) {
    return await ApikeyModel.updateOne(
        {
            name,
            userId,
        },
        { $set: { deleted: true } }
    );
}

export async function getInternalApikey(
    userId: mongoose.Types.ObjectId
): Promise<Apikey | null> {
    return await ApikeyModel.findOne({
        userId,
        internal: true,
    }).lean();
}

export async function getApikeyFromName(
    userId: mongoose.Types.ObjectId,
    name: string
): Promise<Apikey | null> {
    return await ApikeyModel.findOne({
        name,
        userId,
        internal: false,
    }).lean();
}
