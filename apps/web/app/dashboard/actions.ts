"use server";

import connectToDatabase from "@/lib/connect-db";
import {
    createApiKey,
    getApiKeyByUserId,
    deleteApiKey,
} from "@/lib/apikey-handlers";
import { getUserFromSession } from "@/lib/user-handlers";
import { auth } from "@/auth";

export async function getApiKeys() {
    await connectToDatabase();

    const session = await auth();
    if (!session || !session.user) {
        return;
    }

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return;
    }

    const apikeys = await getApiKeyByUserId(dbUser._id);
    return apikeys;
}

export async function createApiKeyForUser(
    name: string
): Promise<{ key: string } | undefined> {
    if (!name) {
        throw new Error("Name is required");
    }

    const session = await auth();
    if (!session || !session.user) {
        return;
    }

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return;
    }

    const apikey = await createApiKey(dbUser._id, name);
    return { key: apikey.key };
}

export async function createNewApiKey(
    prevState: Record<string, unknown>,
    formData: FormData
): Promise<{ success: boolean; error?: string }> {
    const apikey = formData.get("apiKey") as string;

    try {
        const result = await createApiKeyForUser(apikey);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function deleteApiKeyOfUser(
    deletedApiKey: string
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session || !session.user) {
        return { success: false, error: "Invalid session" };
    }

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return { success: false, error: "Invalid User" };
    }

    try {
        const result = await deleteApiKey(dbUser._id, deletedApiKey);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
