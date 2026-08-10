"use server";

import { auth } from "@/auth";
import { editApiKey, getApikeyByUserId } from "@/lib/apikey-handlers";
import { getMediaLitClient } from "@/lib/get-medialit-client";
import { MediaStats } from "medialit";

export async function updateAppName(
    previousState: Record<string, unknown>,
    formData: FormData,
) {
    const newName = formData.get("newName") as string;
    const keyId = formData.get("keyId") as string;
    if (!newName) return { success: false, error: "Name is required" };
    if (!keyId) return { success: false, error: "Bad request" };
    try {
        const session = await auth();
        if (!session?.user) throw new Error("Unauthenticated");
        const key = await getApikeyByUserId({ userId: session.user.id, keyId });
        if (!key) throw new Error("Apikey not found");
        await editApiKey({ userId: session.user.id, name: key.name, newName });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function getTotalSpaceByApikey(
    keyid: string,
): Promise<MediaStats> {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthenticated");
    const apikey = await getApikeyByUserId({
        userId: session.user.id,
        keyId: keyid,
    });
    if (!apikey) throw new Error("Apikey not found");
    try {
        return await getMediaLitClient(apikey.key).getStats();
    } catch (e) {
        console.error(e);
        return { storage: 0, maxStorage: 0 };
    }
}
