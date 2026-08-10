"use server";

import { getApikeyFromKeyId } from "@/lib/apikey-handlers";
import { auth } from "@/auth";
import { Media } from "@medialit/models";
import { getMediaLitClient } from "@/lib/get-medialit-client";

export async function getMediaFiles(
    keyid: string,
    page: number,
): Promise<Media[]> {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthenticated");
    }

    const apikey = await getApikeyFromKeyId(keyid);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const client = getMediaLitClient(apikey.key);

    return await client.list(page || 1, 10);
}

export async function getCount(keyid: string) {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthenticated");
    }

    const apikey = await getApikeyFromKeyId(keyid);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const client = getMediaLitClient(apikey.key);

    return await client.getCount();
}
