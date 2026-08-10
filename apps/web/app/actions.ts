"use server";

import { auth, Session } from "@/auth";
import {
    createApiKey,
    getApiKeys as getApiKeysForSession,
    deleteApiKey,
    editApiKey,
    getApikeyFromKeyId,
} from "@/lib/apikey-handlers";
import { getUserFromSession } from "@/lib/user-handlers";
import { Apikey, User } from "@medialit/models";

export async function getUser(): Promise<any | null> {
    const session: Session | null = await auth();
    return session?.user ?? null;
}

export async function getSubscriber(): Promise<Pick<
    User,
    "email" | "userId" | "subscriptionEndsAfter" | "subscriptionStatus"
> | null> {
    const session = await auth();
    const user = await getUserFromSession(session);
    if (!user) return null;
    return {
        email: user.email,
        userId: user.userId,
        subscriptionEndsAfter: user.subscriptionEndsAfter ?? undefined,
        subscriptionStatus: user.subscriptionStatus,
    };
}

export async function getApiKeys() {
    const session = await auth();
    if (!session?.user) return;
    return getApiKeysForSession();
}

export async function getApikeyUsingKeyId(
    keyId: string,
): Promise<Pick<Apikey, "name" | "key" | "keyId" | "default"> | null> {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthenticated");
    const apikey = await getApikeyFromKeyId(keyId);
    if (!apikey) return null;
    return {
        keyId: apikey.keyId,
        name: apikey.name,
        key: apikey.key,
        default: apikey.default,
    };
}

export async function createApiKeyForUser(
    name: string,
): Promise<{ key: string; keyId: string } | undefined> {
    if (!name) throw new Error("Name is required");
    const session = await auth();
    if (!session?.user) return;
    const apikey = await createApiKey(name);
    return { key: apikey.key, keyId: apikey.keyId };
}

export async function createNewApiKey(
    prevState: Record<string, unknown>,
    formData: FormData,
): Promise<{ success: boolean; error?: string; keyId?: string }> {
    try {
        const created = await createApiKeyForUser(
            formData.get("apiKey") as string,
        );
        return { success: true, keyId: created?.keyId };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function deleteApiKeyOfUser(
    keyId: string,
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Invalid session" };
    try {
        await deleteApiKey(keyId);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function editApiKeyforUser(
    prevState: Record<string, unknown>,
    formData: FormData,
): Promise<{ success: boolean; error?: string }> {
    const name = formData.get("name") as string;
    const newName = formData.get("newName") as string;
    const session = await auth();
    if (!session?.user) return { success: false, error: "Invalid session" };
    if (!newName && !name) throw new Error("Bad request");
    try {
        const apikey = (await getApiKeysForSession()).find(
            (key) => key.name === name,
        );
        if (!apikey) throw new Error("Apikey not found");
        await editApiKey({
            keyId: apikey.keyId,
            newName,
        });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
