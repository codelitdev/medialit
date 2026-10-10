"use server";

import { auth } from "@/auth";
import { serverApi } from "@/lib/server-api";
type MediaStats = { storage: number; maxStorage: number };

export async function updateAppName(
    previousState: Record<string, unknown>,
    formData: FormData,
) {
    const newName = formData.get("newName") as string;
    const keyId = formData.get("keyId") as string;
    if (!newName) {
        return { success: false, error: "Name is required" };
    }
    if (!keyId) {
        return { success: false, error: "Bad request" };
    }

    try {
        const session = await auth();
        if (!session?.user) {
            throw new Error("Unauthenticated");
        }
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(keyId)}`,
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
    const keyId = formData.get("keyId") as string;
    if (!keyId) return { success: false, error: "Bad request" };

    try {
        const session = await auth();
        if (!session?.user) throw new Error("Unauthenticated");
        const response = await serverApi(
            `/api/apps/${encodeURIComponent(keyId)}/default`,
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

export async function getTotalSpaceByApikey(
    keyid: string,
): Promise<MediaStats> {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthenticated");
    }
    const response = await serverApi(
        `/api/apps/${encodeURIComponent(keyid)}/stats`,
    );
    if (!response.ok) {
        return { storage: 0, maxStorage: 0 };
    }
    return response.json();
}
