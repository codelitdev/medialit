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
    appId,
    access,
    group,
    search,
    kind,
}: {
    userId: string;
    appId: string;
    access?: AccessControl;
    group?: string;
    search?: string;
    kind?: GetPageProps["kind"];
}) {
    return { userId: String(userId), appId, access, group, search, kind };
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { escapeRegex };

export async function getMedia({
    userId,
    appId,
    mediaId,
}: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<MediaWithUserId | null> {
    const row = await getMediaRecord({ userId, appId, mediaId });
    return row;
}

export async function getMediaCount({
    userId,
    appId,
    access,
    group,
    search,
    kind,
}: {
    userId: string;
    appId: string;
    access?: AccessControl;
    group?: string;
    search?: string;
    kind?: GetPageProps["kind"];
}): Promise<number> {
    return countMedia({
        userId: String(userId),
        appId,
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
    appId,
}: {
    userId: string;
    appId?: string;
}): Promise<number> {
    return totalMediaSize({ userId: String(userId), appId });
}

export async function getPaginatedMedia({
    userId,
    appId,
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
        appId,
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
        appId: mediaData.appId,
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
