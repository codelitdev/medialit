"use server";

import { auth, Session } from "@/auth";
import {
    createApiKey,
    getApiKeysByUserId,
    deleteApiKey,
    editApiKey,
    getApikeyFromKeyId,
} from "@/lib/apikey-handlers";
import { Apikey, User } from "@medialit/models";

export async function getUser(): Promise<any | null> {
    const session: Session | null = await auth();
    return session?.user ?? null;
}

export async function getSubscriber(): Promise<User | null> {
    const session = await auth();
    return session?.user ? (session.user as User) : null;
}

export async function getApiKeys() {
    const session = await auth();
    if (!session?.user) return;
    return getApiKeysByUserId(session.user.id);
}

export async function getApikeyUsingKeyId(
    keyId: string,
): Promise<Pick<Apikey, "name" | "key" | "keyId" | "default"> | null> {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthenticated");
    const apikey = await getApikeyFromKeyId(session.user.id, keyId);
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
): Promise<{ key: string } | undefined> {
    if (!name) throw new Error("Name is required");
    const session = await auth();
    if (!session?.user) return;
    const apikey = await createApiKey(session.user.id, name);
    return { key: apikey.key };
}

export async function createNewApiKey(
    prevState: Record<string, unknown>,
    formData: FormData,
): Promise<{ success: boolean; error?: string }> {
    try {
        await createApiKeyForUser(formData.get("apiKey") as string);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function deleteApiKeyOfUser(
    keyId: string,
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Invalid session" };
    const apikey = await getApikeyFromKeyId(session.user.id, keyId);
    if (!apikey) return { success: false, error: "Apikey not found" };
    if (apikey.default)
        return { success: false, error: "Default Apikey cannot be deleted" };
    try {
        await deleteApiKey(session.user.id, keyId);
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
        await editApiKey({ userId: session.user.id, name, newName });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
