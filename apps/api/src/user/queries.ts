import type { UserRow } from "@medialit/db";
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
