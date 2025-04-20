"use server";

import { auth } from "@/auth";
import { getApikeyFromKeyId, getInternalApikey } from "@/lib/apikey-handlers";
import connectToDatabase from "@/lib/connect-db";
import { getMediaTotalSize } from "@/lib/media-handlers";
import { getUserFromSession } from "@/lib/user-handlers";
import ApikeyModel from "@/models/apikey";

export async function updateAppName(
    previousState: Record<string, unknown>,
    formData: FormData,
) {
    const newName = formData.get("newName") as string;
    const keyId = formData.get("keyId") as string;
    if (!newName) {
        return { success: false, error: "Name is required" };
    }
    if (!keyId) {
        return { success: false, error: "Bad request" };
    }

    try {
        const session = await auth();
        if (!session || !session.user) {
            throw new Error("Unauthenticated");
        }

        await connectToDatabase();

        const dbUser = await getUserFromSession(session);
        if (!dbUser) {
            throw new Error("User not found");
        }

        await ApikeyModel.updateOne(
            {
                userId: dbUser._id,
                keyId,
            },
            { $set: { name: newName } },
        );

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function getTotalSpaceByApikey(
    keyid: string,
): Promise<{ storage: number; maxStorage: number }> {
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
        console.error("Internal apikey not found for user", dbUser._id);
        throw new Error("We messed up. Please try again later.");
    }
    const apikey = await getApikeyFromKeyId(dbUser._id, keyid);

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    try {
        const response = await getMediaTotalSize({
            apikey: apikey.key,
            internalApikey: internalApikey.key,
        });

        return response;
    } catch (e: any) {
        console.error(e);
        return { storage: 0, maxStorage: 0 };
    }
}
