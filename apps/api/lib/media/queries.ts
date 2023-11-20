import { numberOfRecordsPerPage } from "../config/constants";
import GetPageProps from "./GetPageProps";
import MediaModel, { Media } from "./model";

export async function getMedia({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<Media | null> {
    return await MediaModel.findOne({ mediaId, apikey, userId });
}

export async function getPaginatedMedia({
    userId,
    apikey,
    access,
    page,
    group,
    recordsPerPage,
}: GetPageProps): Promise<Media[]> {
    const query: Partial<Media> = { userId, apikey };
    if (access) {
        query.accessControl = access === "private" ? "private" : "public-read";
    }
    if (group) {
        query.group = group;
    }
    const limitWithFallback = recordsPerPage || numberOfRecordsPerPage;

    return await MediaModel.find(query, {
        userId: 1,
        mediaId: 1,
        originalFileName: 1,
        mimeType: 1,
        size: 1,
        accessControl: 1,
        thumbnailGenerated: 1,
        caption: 1,
        group: 1,
    })
        .sort({ _id: 1 })
        .skip(page ? (page - 1) * limitWithFallback : 0)
        .limit(limitWithFallback);
}

export async function deleteMediaQuery(
    userId: string,
    mediaId: string
): Promise<any> {
    return await MediaModel.deleteOne({ userId, mediaId });
}

export async function createMedia({
    fileName,
    mediaId,
    userId,
    apikey,
    originalFileName,
    mimeType,
    size,
    thumbnailGenerated,
    caption,
    accessControl,
    group,
}: Media): Promise<Media> {
    const media: Media = await MediaModel.create({
        fileName,
        mediaId,
        userId,
        apikey,
        originalFileName,
        mimeType,
        size,
        thumbnailGenerated,
        caption,
        accessControl,
        group,
    });
    return media;
}
