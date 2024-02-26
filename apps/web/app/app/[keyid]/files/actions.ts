"use server";

import connectToDatabase from "@/lib/connect-db";
import { getUserFromSession } from "@/lib/user-handlers";
import { getApikeyFromKeyId, getInternalApikey } from "@/lib/apikey-handlers";
import {
    getPaginatedMedia,
    getMediaCount,
    getMedia as getMediaFromServer,
} from "@/lib/media-handlers";
import { auth } from "@/auth";
import { Media } from "@medialit/models";

export async function getMediaFiles(
    keyid: string,
    page: number
): Promise<Media[]> {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthenticated");
    }

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        throw new Error("User not found");
    }

    const internalApikey = await getInternalApikey(dbUser._id);

    if (!internalApikey) {
        console.error("Internal apikey not found for user", dbUser._id); // eslint-disable-line no-console
        throw new Error("We messed up. Please try again later.");
    }
    const apikey = await getApikeyFromKeyId(dbUser._id, keyid);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const media = await getPaginatedMedia({
        apikey: apikey.key,
        internalApikey: internalApikey.key,
        page: page || 1,
    });

    return media;
}

export async function getCount(keyid: string) {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthenticated");
    }

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        throw new Error("User not found");
    }

    const internalApikey = await getInternalApikey(dbUser._id);

    if (!internalApikey) {
        console.error("Internal apikey not found for user", dbUser._id); // eslint-disable-line no-console
        throw new Error("We messed up. Please try again later.");
    }

    const apikey = await getApikeyFromKeyId(dbUser._id, keyid);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const mediacount = await getMediaCount({
        apikey: apikey.key,
        internalApikey: internalApikey.key,
    });

    return mediacount;
}
