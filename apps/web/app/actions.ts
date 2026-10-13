"use server";

import { auth, type Session } from "@/auth";
import { serverApi } from "@/lib/server-api";
import { Apikey, User } from "@medialit/models";

async function errorMessage(response: Response) {
    const data = await response.json().catch(() => ({}));
    return data.error || "Request failed";
}

export async function getUser(): Promise<Session["user"] | null> {
    const session = await auth();
    return session?.user ?? null;
}

export async function getSubscriber(): Promise<
    | (Pick<User, "id" | "active" | "userId" | "email"> & {
          plan: "oss" | "basic" | "pro";
          /** The paid subscription, whatever provider holds it, or null. */
          subscription: {
              status: "active" | "past_due" | "cancelling";
              interval: "month" | "year" | null;
              paidThroughAt: string | null;
          } | null;
          deploymentMode: "oss" | "cloud";
      })
    | null
> {
    const session = await auth();
    if (!session?.user) return null;
    const response = await serverApi("/api/account");
    if (!response.ok) return null;
    return response.json();
}

export async function getApiKeys() {
    const session = await auth();
    if (!session?.user) return;
    const response = await serverApi("/api/apps");
    if (!response.ok) return;
    return response.json();
}

export async function getApikeyUsingKeyId(
    keyId: string,
): Promise<Pick<Apikey, "name" | "key" | "keyId" | "default"> | null> {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthenticated");
    }
    const response = await serverApi(`/api/apps/${encodeURIComponent(keyId)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(await errorMessage(response));
    }
    return response.json();
}

export async function createNewApiKey(
    prevState: Record<string, unknown>,
    formData: FormData,
): Promise<{ success: boolean; error?: string }> {
    const name = formData.get("apiKey") as string;
    try {
        const response = await serverApi("/api/apps", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        if (!response.ok) {
            return { success: false, error: await errorMessage(response) };
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function deleteApiKeyOfUser(
    keyId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(keyId)}`,
            { method: "DELETE" },
        );
        if (!response.ok) {
            return { success: false, error: await errorMessage(response) };
        }
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
    if (!newName || !name) {
        return { success: false, error: "Bad request" };
    }
    const apps = await getApiKeys();
    const match = Array.isArray(apps)
        ? apps.find((app) => app.name === name)
        : null;
    if (!match) {
        return { success: false, error: "Apikey not found" };
    }
    try {
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(match.keyId)}`,
            {
                method: "PATCH",
                body: JSON.stringify({ name: newName }),
            },
        );
        if (!response.ok) {
            return { success: false, error: await errorMessage(response) };
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
