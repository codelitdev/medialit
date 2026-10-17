"use server";

import { auth, type Session } from "@/auth";
import { serverApi } from "@/lib/server-api";
import type { ApiKey, App, User } from "@medialit/models";

async function errorMessage(response: Response) {
    const data = await response.json().catch(() => ({}));
    return data.error || "Request failed";
}

export async function getUser(): Promise<Session["user"] | null> {
    const session = await auth();
    return session?.user ?? null;
}

/* Server actions below leave the session check to the API: it answers 401
   without one, so checking here first would only add a round trip. */
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
    const response = await serverApi("/api/account");
    if (!response.ok) return null;
    return response.json();
}

export async function getApps(): Promise<App[] | undefined> {
    const response = await serverApi("/api/apps");
    if (!response.ok) return;
    return response.json();
}

export type AppSummary = {
    appId: string;
    name: string;
    default: boolean;
    count: number;
    storage: number;
    images: number;
    videos: number;
    pdfs: number;
    others: number;
    imageStorage: number;
    videoStorage: number;
    pdfStorage: number;
    otherStorage: number;
    lastUpload: string | null;
    /** Percent of the account's storage. */
    share: number;
};

export type AppsDashboardData = {
    apps: AppSummary[];
    appCount: number;
    totalFiles: number;
    totalStorage: number;
    totalImages: number;
    totalVideos: number;
    totalPdfs: number;
    totalOthers: number;
    largestApp: {
        appId: string;
        name: string;
        storage: number;
        share: number;
    } | null;
};

export async function getAppsDashboard(): Promise<AppsDashboardData | null> {
    const response = await serverApi("/api/apps/overview");
    if (!response.ok) return null;
    return response.json();
}

export async function getAppSummary(appId: string): Promise<AppSummary> {
    const response = await serverApi(
        `/api/apps/${encodeURIComponent(appId)}/summary`,
    );
    if (!response.ok) {
        throw new Error(await errorMessage(response));
    }
    return response.json();
}

export async function getApp(appId: string): Promise<App | null> {
    const response = await serverApi(`/api/apps/${encodeURIComponent(appId)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(await errorMessage(response));
    }
    return response.json();
}

export type CreateAppState = {
    success: boolean;
    error?: string;
    appId?: string;
    /** The new app's first API key. Shown once, then never available again. */
    key?: string;
};

export async function createNewApp(
    prevState: CreateAppState,
    formData: FormData,
): Promise<CreateAppState> {
    const name = formData.get("name") as string;
    try {
        const response = await serverApi("/api/apps", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        if (!response.ok) {
            return { success: false, error: await errorMessage(response) };
        }
        const data = await response.json();
        return { success: true, appId: data.appId, key: data.key };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function deleteApp(
    appId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(appId)}`,
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

export async function listApiKeys(
    appId: string,
): Promise<{ items: ApiKey[]; limit: number }> {
    const response = await serverApi(
        `/api/apps/${encodeURIComponent(appId)}/keys`,
    );
    if (!response.ok) {
        throw new Error(await errorMessage(response));
    }
    return response.json();
}

export async function createApiKey(
    appId: string,
    name: string,
): Promise<
    | { success: true; key: string; apiKey: ApiKey }
    | { success: false; error: string }
> {
    try {
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(appId)}/keys`,
            { method: "POST", body: JSON.stringify({ name }) },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                success: false,
                error:
                    data.error === "api_key_limit_reached"
                        ? "This app already has the most keys it can have. Revoke one you no longer use first."
                        : data.error || "Could not create the key.",
            };
        }
        const { key, ...apiKey } = data;
        return { success: true, key, apiKey };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function revokeApiKey(
    appId: string,
    keyId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(appId)}/keys/${encodeURIComponent(keyId)}`,
            { method: "DELETE" },
        );
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            return {
                success: false,
                error:
                    data.error_description ||
                    data.error ||
                    "Could not revoke the key.",
            };
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
