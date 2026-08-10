import type { UserRow } from "../db/types";
import type { SubscriptionStatus } from "@medialit/models";
import { createApiKey } from "../apikey/queries";
import getRepositories from "../config/repositories";

export async function getUser(id: string): Promise<UserRow | null> {
    return await getRepositories().users.findById(id);
}

export async function findByEmail(email: string): Promise<UserRow | null> {
    return await getRepositories().users.findByEmail(email);
}

export async function createUser(
    email: string,
    name?: string,
    subscriptionStatus?: SubscriptionStatus,
): Promise<UserRow> {
    const user = await getRepositories().users.create({
        email,
        active: true,
        name,
        subscriptionStatus,
    });

    // Automatically create a default API key for the new user
    await createApiKey(
        user.id,
        process.env.DEFAULT_APP_NAME || "My Store",
        true,
    );

    return user;
}

/**
 * Mirrors a newly-created Better Auth identity into MediaLit's domain users.
 * The ID is deliberately supplied by Better Auth so OAuth `sub` claims map
 * directly to the existing API-key, quota, and billing records.
 */
export async function ensureUserForAuth(values: {
    id: string;
    email: string;
    name?: string | null;
}): Promise<UserRow> {
    const existingById = await getUser(values.id);
    if (existingById) return existingById;

    const existingByEmail = await findByEmail(values.email);
    if (existingByEmail) {
        throw new Error(
            `Auth identity ${values.id} conflicts with existing MediaLit user ${existingByEmail.id}`,
        );
    }

    const user = await getRepositories().users.create({
        id: values.id,
        email: values.email,
        name: values.name ?? undefined,
        active: true,
        subscriptionStatus: "not-subscribed",
    });
    await createApiKey(
        user.id,
        process.env.DEFAULT_APP_NAME || "My Store",
        true,
    );
    return user;
}
