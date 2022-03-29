import { numberOfRecordsPerPage } from "../config/constants";
import GetPageProps from "./GetPageProps";
import MediaModel, { Media } from "./model";

export async function getMedia(userId: string, mediaId: string): Promise<Media | null> {
    return await MediaModel.findOne({ mediaId, userId });
}

export async function getPaginatedPage({ userId, access, page, recordsPerPage }: GetPageProps): Promise<Media[]> {
    let query: Partial<Media> = { userId };
    if (access) {
        query.accessControl = access === "private" ? "private" : "public-read";
    }
    const limitWithFallback = recordsPerPage || numberOfRecordsPerPage;

    return await MediaModel
        .find(
            query,
            {
                userId: 1,
                mediaId: 1,
                originalFileName: 1,
                mimeType: 1,
                size: 1,
                accessControl: 1,
                thumbnailGenerated: 1,
                caption: 1
            }
        )
        .sort({ _id: 1 })
        .skip(page ? (page - 1) * limitWithFallback: 0)
        .limit(limitWithFallback);
}