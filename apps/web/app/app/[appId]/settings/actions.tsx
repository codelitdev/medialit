"use server";

import { serverApi } from "@/lib/server-api";

export async function updateAppName(
    previousState: Record<string, unknown>,
    formData: FormData,
) {
    const newName = formData.get("newName") as string;
    const appId = formData.get("appId") as string;
    if (!newName) {
        return { success: false, error: "Name is required" };
    }
    if (!appId) {
        return { success: false, error: "Bad request" };
    }

    try {
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(appId)}`,
            {
                method: "PATCH",
                body: JSON.stringify({ name: newName }),
            },
        );
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Request failed");
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function makeDefaultApp(
    previousState: Record<string, unknown>,
    formData: FormData,
) {
    const appId = formData.get("appId") as string;
    if (!appId) return { success: false, error: "Bad request" };

    try {
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(appId)}/default`,
            { method: "PATCH" },
        );
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Request failed");
        }
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Request failed",
        };
    }
}
