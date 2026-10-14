import { numberOfRecordsPerPage } from "../config/constants";
import GetPageProps from "./GetPageProps";
import {
    AccessControl,
    Constants,
    type MediaWithUserId,
} from "@medialit/models";
import {
    countMedia,
    createMediaRecord,
    deleteMediaRecord,
    getMediaRecord,
    listMedia,
    totalMediaSize,
} from "@/db";

export function buildMediaCountQuery({
    userId,
    apikey,
    access,
    group,
    search,
    kind,
}: {
    userId: string;
    apikey: string;
    access?: AccessControl;
    group?: string;
    search?: string;
    kind?: GetPageProps["kind"];
}) {
    return { userId: String(userId), apikey, access, group, search, kind };
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { escapeRegex };

export async function getMedia({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<MediaWithUserId | null> {
    const row = await getMediaRecord({ userId, apikey, mediaId });
    return row;
}

export async function getMediaCount({
    userId,
    apikey,
    access,
    group,
    search,
    kind,
}: {
    userId: string;
    apikey: string;
    access?: AccessControl;
    group?: string;
    search?: string;
    kind?: GetPageProps["kind"];
}): Promise<number> {
    return countMedia({
        userId: String(userId),
        apikey,
        access:
            access === Constants.AccessControl.PRIVATE
                ? "private"
                : access
                  ? "public"
                  : undefined,
        group,
        search,
        kind,
    });
}

export async function getTotalSpace({
    userId,
    apikey,
}: {
    userId: string;
    apikey?: string;
}): Promise<number> {
    return totalMediaSize({ userId: String(userId), apikey });
}

export async function getPaginatedMedia({
    userId,
    apikey,
    access,
    page,
    group,
    recordsPerPage,
    search,
    kind,
    sort,
}: GetPageProps): Promise<Array<MediaWithUserId & { createdAt: Date }>> {
    return listMedia({
        userId: String(userId),
        apikey,
        access: access
            ? access === Constants.AccessControl.PRIVATE
                ? "private"
                : "public"
            : undefined,
        group,
        page,
        recordsPerPage: recordsPerPage || numberOfRecordsPerPage,
        search,
        kind,
        sort,
    });
}

export async function deleteMediaQuery(
    userId: string,
    mediaId: string,
): Promise<void> {
    await deleteMediaRecord(userId, mediaId);
}

export async function createMedia(
    mediaData: MediaWithUserId,
): Promise<MediaWithUserId> {
    return createMediaRecord({
        fileName: mediaData.fileName,
        mediaId: mediaData.mediaId,
        userId: String(mediaData.userId),
        apikey: mediaData.apikey,
        originalFileName: mediaData.originalFileName,
        mimeType: mediaData.mimeType,
        size: mediaData.size,
        thumbnailGenerated: mediaData.thumbnailGenerated,
        accessControl:
            mediaData.accessControl === "public" ? "public" : "private",
        group: mediaData.group,
        caption: mediaData.caption,
        temp: mediaData.temp ?? true,
    });
}

export default {
    getMedia,
    getMediaCount,
    getTotalSpace,
    getPaginatedMedia,
    deleteMediaQuery,
    createMedia,
};
