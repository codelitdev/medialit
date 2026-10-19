"use server";

import { serverApi } from "@/lib/server-api";
import type { MediaListItem } from "@/lib/media";

export type MediaFilters = {
    search?: string;
    kind?: "image" | "video" | "pdf" | "other";
    sort?: "newest" | "oldest" | "name" | "largest";
};

function filtersQuery(filters: MediaFilters = {}) {
    const query = new URLSearchParams();
    if (filters.search?.trim()) query.set("search", filters.search.trim());
    if (filters.kind) query.set("kind", filters.kind);
    if (filters.sort && filters.sort !== "newest")
        query.set("sort", filters.sort);
    return query;
}

export async function getMediaFiles(
    appId: string,
    page: number,
    limit = 16,
    filters: MediaFilters = {},
): Promise<MediaListItem[]> {
    const query = filtersQuery(filters);
    query.set("page", String(page || 1));
    query.set("limit", String(limit));
    const response = await serverApi(
        `/api/apps/${encodeURIComponent(appId)}/media?${query.toString()}`,
    );
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to list media");
    }
    return response.json();
}

export async function getCount(appId: string, filters: MediaFilters = {}) {
    const query = filtersQuery(filters);
    const suffix = query.size ? `?${query.toString()}` : "";
    const response = await serverApi(
        `/api/apps/${encodeURIComponent(appId)}/media/count${suffix}`,
    );
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to count media");
    }
    const data = await response.json();
    return data.count;
}
