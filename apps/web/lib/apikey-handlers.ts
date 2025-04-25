import { Apikey } from "@medialit/models";
import ApikeyModel from "@/models/apikey";
import { getUniqueId } from "@medialit/utils";
import mongoose from "mongoose";

export async function getApiKeysByUserId(
    userId: mongoose.Types.ObjectId,
    keyId?: string,
): Promise<Apikey[] | null> {
    let result: Apikey[] | null;
    const projections = {
        _id: 0,
        name: 1,
        // key: 1,
        httpReferrers: 1,
        ipAddresses: 1,
        createdAt: 1,
        updatedAt: 1,
        keyId: 1,
    };

    const query: Record<string, unknown> = {
        userId,
        deleted: { $ne: true },
    };

    if (keyId) {
        query.keyId = keyId;
    }

    return await ApikeyModel.find(query, projections);
}

export async function getApikeyFromKeyId(
    userId: mongoose.Types.ObjectId,
    keyId: string,
): Promise<Apikey | null> {
    return (await ApikeyModel.findOne({
        keyId,
        userId,
        deleted: { $ne: true },
    }).lean()) as Apikey | null;
}

export async function createApiKey(
    userId: mongoose.Types.ObjectId,
    name: string,
): Promise<Apikey> {
    return await ApikeyModel.create({
        name,
        key: getUniqueId(),
        userId,
    });
}

export async function deleteApiKey(
    userId: mongoose.Types.ObjectId,
    keyId: string,
) {
    return await ApikeyModel.updateOne(
        {
            keyId,
            userId,
        },
        { $set: { deleted: true } },
    );
}

export async function editApiKey({
    userId,
    name,
    newName,
}: {
    userId: mongoose.Types.ObjectId;
    name: string;
    newName: string;
}) {
    const query = { userId, name };
    const editedApiKey = await ApikeyModel.updateOne(query, {
        $set: { name: newName },
    });

    return editedApiKey;
}

export async function getApikeyByUserId({
    userId,
    keyId,
}: {
    userId: mongoose.Types.ObjectId;
    keyId: string;
}): Promise<Apikey | null> {
    const apikeys = await getApiKeysByUserId(userId, keyId);
    if (!apikeys || apikeys.length === 0 || apikeys[0].keyId !== keyId) {
        throw new Error("Apikey not found");
    }

    return await getApikeyFromKeyId(userId, keyId);
}
