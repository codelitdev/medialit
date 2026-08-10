import type { Apikey, User } from "@medialit/models";
import { cookies } from "next/headers";

export type WebUser = User & {
    subscriptionEndsAfter: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type PublicApikey = Pick<
    Apikey,
    "name" | "httpReferrers" | "ipAddresses" | "default" | "keyId"
> & {
    createdAt: Date;
    updatedAt: Date;
};

function apiServer(): string {
    const server = process.env.API_SERVER;
    if (!server) throw new Error("API_SERVER is not configured");
    return server.replace(/\/$/, "");
}

async function request<T>(
    path: string,
    init: RequestInit,
    headers: Record<string, string>,
): Promise<T> {
    const response = await fetch(`${apiServer()}${path}`, {
        ...init,
        headers: {
            Accept: "application/json",
            ...headers,
            ...init.headers,
        },
        cache: "no-store",
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
            body?.error || `API request failed (${response.status})`,
        );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
}

function parseUser(
    user: Omit<WebUser, "subscriptionEndsAfter"> & {
        subscriptionEndsAfter: string | null;
    },
): WebUser {
    return {
        ...user,
        subscriptionEndsAfter: user.subscriptionEndsAfter
            ? new Date(user.subscriptionEndsAfter)
            : null,
    };
}

function parsePublicApikey(
    apikey: Omit<PublicApikey, "createdAt" | "updatedAt"> & {
        createdAt: string;
        updatedAt: string;
    },
): PublicApikey {
    return {
        ...apikey,
        createdAt: new Date(apikey.createdAt),
        updatedAt: new Date(apikey.updatedAt),
    };
}

async function userHeaders(): Promise<Record<string, string>> {
    const cookieHeader = (await cookies()).toString();
    if (!cookieHeader) throw new Error("Unauthenticated");
    return { Cookie: cookieHeader };
}

function serviceHeaders(): Record<string, string> {
    const secret = process.env.WEB_INTERNAL_API_SECRET;
    if (!secret) throw new Error("WEB_INTERNAL_API_SECRET is not configured");
    return { "x-medialit-internal-secret": secret };
}

export const webApi = {
    async getUser(): Promise<WebUser | null> {
        try {
            return parseUser(
                await request(
                    "/internal/web/user",
                    { method: "GET" },
                    await userHeaders(),
                ),
            );
        } catch (error) {
            if (error instanceof Error && error.message === "User not found") {
                return null;
            }
            throw error;
        }
    },

    async listApiKeys(): Promise<PublicApikey[]> {
        const apikeys = await request<
            Array<
                Omit<PublicApikey, "createdAt" | "updatedAt"> & {
                    createdAt: string;
                    updatedAt: string;
                }
            >
        >("/internal/web/apikeys", { method: "GET" }, await userHeaders());
        return apikeys.map(parsePublicApikey);
    },

    async getApiKey(keyId: string): Promise<Apikey> {
        return request(
            `/internal/web/apikeys/${encodeURIComponent(keyId)}`,
            { method: "GET" },
            await userHeaders(),
        );
    },

    async createApiKey(name: string): Promise<Apikey> {
        return request(
            "/internal/web/apikeys",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            },
            await userHeaders(),
        );
    },

    async renameApiKey(keyId: string, name: string): Promise<void> {
        return request(
            `/internal/web/apikeys/${encodeURIComponent(keyId)}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            },
            await userHeaders(),
        );
    },

    async deleteApiKey(keyId: string): Promise<void> {
        return request(
            `/internal/web/apikeys/${encodeURIComponent(keyId)}`,
            { method: "DELETE" },
            await userHeaders(),
        );
    },
};

export const webServiceApi = {
    log(
        severity: "info" | "warn" | "error",
        message: string,
        metadata?: unknown,
    ): Promise<void> {
        return request(
            "/internal/web/logs",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ severity, message, metadata }),
            },
            serviceHeaders(),
        );
    },

    updateSubscription(values: {
        userId: string;
        subscriptionStatus:
            | "not-subscribed"
            | "subscribed"
            | "cancelled"
            | "paused"
            | "expired";
        subscriptionEndsAfter: Date | null;
        subscriptionMethod?: "stripe" | "lemon";
        customerId?: string;
        subscriptionId?: string;
    }): Promise<void> {
        return request(
            "/internal/web/subscriptions",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...values,
                    subscriptionEndsAfter:
                        values.subscriptionEndsAfter?.toISOString() ?? null,
                }),
            },
            serviceHeaders(),
        );
    },
};
