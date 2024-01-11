"use server";

import connectToDatabase from "@/lib/connect-db";
import { createApiKey, getApiKeyByUserId } from "@/lib/apikey-handlers";
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
