"use server";

import { AuthError, Session } from "next-auth";
import { createTransport } from "nodemailer";
import { auth, signIn } from "@/auth";
import { SITE_NAME } from "@/lib/constants";
import { generateUniquePasscode, hashCode } from "@/lib/magic-code-utils";
import connectToDatabase from "@/lib/connect-db";
import verificationToken from "@/models/verification-token";
import {
    createApiKey,
    getApiKeyByUserId,
    deleteApiKey,
    editApiKey,
    getApikeyFromKeyId,
} from "@/lib/apikey-handlers";
import { getUserFromSession } from "@/lib/user-handlers";
import { Apikey } from "@medialit/models";
import UserModel from "@/models/user";
import { User } from "@medialit/models";

export async function authenticate(
    prevState: Record<string, unknown>,
    formData: FormData,
): Promise<{
    success: boolean;
    checked: boolean;
    error?: string;
}> {
    try {
        await signIn("credentials", {
            email: formData.get("email"),
            code: formData.get("code"),
            redirect: false,
        });
        return { success: true, checked: true };
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case "CredentialsSignin":
                    return {
                        success: false,
                        checked: true,
                        error: "Invalid credentials",
                    };
                default:
                    return {
                        success: false,
                        checked: true,
                        error: "Something went wrong",
                    };
            }
        }
        return { success: false, checked: true, error: (error as any).message };
    }
}

export async function sendCode(
    prevState: Record<string, unknown>,
    formData: FormData,
): Promise<{ success: boolean; error?: string }> {
    const email = formData.get("email") as string;
    const code = generateUniquePasscode();
    await connectToDatabase();

    await verificationToken.create({
        email,
        code: hashCode(code),
        timestamp: Date.now() + 1000 * 60 * 5,
    });

    const transporter = createTransport({
        host: process.env.EMAIL_HOST,
        port: +(process.env.EMAIL_PORT || 587),
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Your verification code for ${SITE_NAME}`,
            html: `
              Enter the following code in to the app.
              ${code}
              `,
        });

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

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

    const apikeys = await getApiKeyByUserId(dbUser._id);
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
