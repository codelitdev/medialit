"use server";

import { auth } from "@/auth";
import { serverApi } from "@/lib/server-api";
import { Media } from "@medialit/models";

export async function getMediaFiles(
    keyid: string,
    page: number,
): Promise<Media[]> {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthenticated");
    }
    const response = await serverApi(
        `/api/apps/${encodeURIComponent(keyid)}/media?page=${page || 1}&limit=10`,
    );
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to list media");
    }
    return response.json();
}

export async function getCount(keyid: string) {
    const session = await auth();
    if (!session?.user) {
        throw new Error("Unauthenticated");
    }
    const response = await serverApi(
        `/api/apps/${encodeURIComponent(keyid)}/media/count`,
    );
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to count media");
    }
    const data = await response.json();
    return data.count;
}
