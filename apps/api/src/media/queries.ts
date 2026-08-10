import type { MediaRow, NewMediaRow } from "../db/types";
import { AccessControl } from "@medialit/models";
import { numberOfRecordsPerPage } from "../config/constants";
import getRepositories from "../config/repositories";
import GetPageProps from "./GetPageProps";

export async function getMedia({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<MediaRow | null> {
    return await getRepositories().media.findOne({ userId, apikey, mediaId });
}

export async function getMediaCount({
    userId,
    apikey,
    access,
    group,
}: {
    userId: string;
    apikey: string;
    access?: AccessControl;
    group?: string;
}): Promise<number> {
    return await getRepositories().media.count({
        userId,
        apikey,
        access,
        group,
    });
}

export async function getTotalSpace({
    userId,
    apikey,
}: {
    userId: string;
    apikey?: string;
}): Promise<number> {
    return await getRepositories().media.sumSize({ userId, apikey });
}

export async function getPaginatedMedia({
    userId,
    apikey,
    access,
    page,
    group,
    recordsPerPage,
}: GetPageProps): Promise<MediaRow[]> {
    return await getRepositories().media.paginate({
        userId,
        apikey,
        access,
        page,
        group,
        recordsPerPage: recordsPerPage || numberOfRecordsPerPage,
    });
}

export async function clearTempMedia({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<void> {
    await getRepositories().media.clearTemp({ userId, apikey, mediaId });
}

export async function deleteMediaQuery(
    userId: string,
    mediaId: string,
): Promise<void> {
    await getRepositories().media.deleteOne(userId, mediaId);
}

export async function createMedia(mediaData: NewMediaRow): Promise<MediaRow> {
    return await getRepositories().media.create(mediaData);
}

export default {
    getMedia,
    getMediaCount,
    getTotalSpace,
    getPaginatedMedia,
    clearTempMedia,
    deleteMediaQuery,
    createMedia,
};
