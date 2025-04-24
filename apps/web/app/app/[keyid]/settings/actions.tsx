"use server";

import { auth } from "@/auth";
import { getApikeyByUserId } from "@/lib/apikey-handlers";
import connectToDatabase from "@/lib/connect-db";
import { getMediaLitClient } from "@/lib/get-medialit-client";
import { getUserFromSession } from "@/lib/user-handlers";
import ApikeyModel from "@/models/apikey";
import { MediaStats } from "medialit";

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
): Promise<MediaStats> {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthenticated");
    }

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        throw new Error("User not found");
    }

    const apikey = await getApikeyByUserId({
        userId: dbUser._id,
        keyId: keyid,
    });

    if (!apikey) {
        throw new Error("Apikey not found");
    }

    const client = getMediaLitClient(apikey.key);

    try {
        return await client.getStats();
    } catch (e: any) {
        console.error(e);
        return { storage: 0, maxStorage: 0 };
    }
}
