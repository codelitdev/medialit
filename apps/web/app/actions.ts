import { auth, Session } from "@/auth";
import connectToDatabase from "@/lib/connect-db";
import {
    createApiKey,
    getApiKeysByUserId,
    deleteApiKey,
    editApiKey,
    getApikeyFromKeyId,
} from "@/lib/apikey-handlers";
import { getUserFromSession } from "@/lib/user-handlers";
import { Apikey } from "@medialit/models";
import UserModel from "@/models/user";
import { User } from "@medialit/models";

export async function getUser(): Promise<any | null> {
    const session: Session | null = await auth();
    if (!session || !session.user) {
        return null;
    }
    return session.user;
}

export async function getSubscriber(): Promise<Pick<
    User,
    | "id"
    | "active"
    | "userId"
    | "email"
    | "subscriptionEndsAfter"
    | "subscriptionStatus"
> | null> {
    const session: Session | null = await auth();
    if (!session || !session.user) {
        return null;
    }

    await connectToDatabase();

    return await UserModel.findOne(
        { email: session.user.email },
        {
            email: 1,
            userId: 1,
            subscriptionEndsAfter: 1,
            subscriptionStatus: 1,
            subscribedToUpdates: 1,
            _id: 0,
        },
    );
}

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

    const apikeys = await getApiKeysByUserId(dbUser._id);
    return apikeys;
}

export async function getApikeyUsingKeyId(
    keyId: string,
): Promise<Pick<Apikey, "name" | "key" | "keyId"> | null> {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthenticated");
    }

    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        throw new Error("User not found");
    }

    const apikey = await getApikeyFromKeyId(dbUser._id, keyId);

    if (!apikey) {
        return null;
    }

    return {
        keyId: apikey.keyId,
        name: apikey.name,
        key: apikey.key,
    };
}

export async function createApiKeyForUser(
    name: string,
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
    formData: FormData,
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
    keyId: string,
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
        const result = await deleteApiKey(dbUser._id, keyId);
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
    if (!session || !session.user) {
        return { success: false, error: "Invalid session" };
    }

    if (!newName && !name) {
        throw new Error("Bad request");
    }
    await connectToDatabase();

    const dbUser = await getUserFromSession(session);
    if (!dbUser) {
        return { success: false, error: "Invalid User" };
    }

    try {
        const result = await editApiKey({ userId: dbUser._id, name, newName });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
