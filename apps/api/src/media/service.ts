import path from "path";
import {
    ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT,
    cloudBucket,
    cloudPublicBucket,
} from "../config/constants";
import {
    generateSignedUrl,
    generateCloudfrontSignedUrl,
    streamToObject,
    getObjectBytes,
} from "../services/s3";
import logger from "../services/log";
import { trackEvent } from "../services/events";
import { mediaKind } from "./kind";
import generateKey from "./utils/generate-key";
import GetPageProps from "./GetPageProps";
import {
    deleteMediaQuery,
    getMedia,
    getMediaCount,
    getPaginatedMedia,
} from "./queries";
import { getDb, listDerivativesByMediaIds, listMediaRecordsByIds } from "@/db";
import type { ProcessingStatus } from "../db/schema";
import { deleteMediaFolders, derivativesResponse } from "./derivatives";
import { sealStoredMedia } from "./seal";
import {
    abandonUpload,
    finalizeStoredUpload,
    newUploadTarget,
    startUpload,
} from "./ingest";
import { getPublicFileUrl, getThumbnailUrl } from "./utils/get-public-urls";
import { AccessControl, Constants, MediaWithUserId } from "@medialit/models";
import { MediaResponse } from "./schemas";
import { isTextPreview, MAX_TEXT_PREVIEW_BYTES, mediaPreview } from "./preview";

interface UploadProps {
    userId: string;
    appId: string;
    /** The whole file, for callers that already hold it in memory. */
    body: Buffer;
    fileName: string;
    mimeType: string;
    access: string;
    caption: string;
    group?: string;
    signature?: string;
}

/* Stores a file held in memory and finishes it like any other upload. */
async function upload({
    userId,
    appId,
    body,
    fileName,
    mimeType,
    access,
    caption,
    group,
    signature,
}: UploadProps): Promise<string> {
    const target = newUploadTarget(fileName);
    await startUpload(target, {
        userId,
        appId,
        originalFileName: fileName,
        mimeType,
        declaredSize: body.length,
    });
    try {
        await streamToObject({
            Key: target.key,
            Body: body,
            ContentType: mimeType,
            Bucket: cloudBucket,
        }).done();
    } catch (err) {
        await abandonUpload(target);
        throw err;
    }
    return await finalizeStoredUpload({
        ...target,
        transport: "mcp",
        userId,
        appId,
        originalFileName: fileName,
        mimeType,
        access,
        caption,
        group,
        signature,
    });
}

type MappedMedia = Partial<
    Omit<Omit<MediaWithUserId, "accessControl" | "temp">, "thumbnailGenerated">
> & {
    access: AccessControl;
    thumbnail: string;
    createdAt: Date;
};

async function getPage({
    userId,
    appId,
    access,
    page,
    group,
    recordsPerPage,
    search,
    kind,
    sort,
}: GetPageProps): Promise<MappedMedia[]> {
    const result = await getPaginatedMedia({
        userId,
        appId,
        access,
        page,
        group,
        recordsPerPage,
        search,
        kind,
        sort,
    });
    const mappedResult = result.map(
        (media): MappedMedia => ({
            mediaId: media.mediaId,
            originalFileName: media.originalFileName,
            mimeType: media.mimeType,
            size: media.size,
            access:
                media.accessControl === Constants.AccessControl.PRIVATE
                    ? Constants.AccessControl.PRIVATE
                    : Constants.AccessControl.PUBLIC,
            thumbnail: media.thumbnailGenerated ? getThumbnailUrl(media) : "",
            caption: media.caption,
            group: media.group,
            createdAt: media.createdAt,
        }),
    );

    return mappedResult;
}

async function getMediaCountWithFilter({
    userId,
    appId,
    access,
    group,
}: GetPageProps): Promise<number> {
    return await getMediaCount({
        userId: String(userId),
        appId,
        access,
        group,
    });
}

async function getMediaDetails({
    userId,
    appId,
    mediaId,
}: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<MediaResponse | null> {
    const media: MediaWithUserId | null = await getMedia({
        userId,
        appId,
        mediaId,
    });
    if (!media) {
        return null;
    }

    return await getMediaResponse(media);
}

async function getMediaResponse(
    media: MediaWithUserId,
): Promise<MediaResponse> {
    // Determine file URL based on access control and temp status
    let fileUrl: string;
    if (media.temp || media.accessControl === Constants.AccessControl.PRIVATE) {
        // Temp or private files: use signed URL from private bucket
        fileUrl = await getPrivateFileUrl(media);
    } else {
        // Public sealed files: use direct URL from public bucket
        fileUrl = getPublicFileUrl(media);
    }

    // Determine thumbnail URL
    let thumbnailUrl = "";
    if (media.thumbnailGenerated) {
        if (media.temp) {
            // Temp thumbnail: use signed URL from private bucket
            thumbnailUrl = await getPrivateFileUrl(media, true);
        } else {
            // Sealed thumbnail: use direct URL from public bucket
            thumbnailUrl = getThumbnailUrl(media);
        }
    }

    const record = media as MediaWithUserId & {
        processingStatus?: ProcessingStatus;
        processingError?: string;
    };
    const derivativeRows =
        (await listDerivativesByMediaIds(getDb(), [media.mediaId])).get(
            media.mediaId,
        ) ?? [];

    return {
        mediaId: media.mediaId,
        originalFileName: media.originalFileName,
        mimeType: media.mimeType,
        size: media.size,
        access:
            media.accessControl === Constants.AccessControl.PRIVATE
                ? Constants.AccessControl.PRIVATE
                : Constants.AccessControl.PUBLIC,
        file: fileUrl,
        thumbnail: thumbnailUrl,
        caption: media.caption,
        group: media.group,
        processing: {
            status: record.processingStatus ?? "ready",
            ...(record.processingError
                ? { error: record.processingError }
                : {}),
        },
        derivatives: await derivativesResponse(media.mediaId, derivativeRows),
    };
}

async function getPrivateFileUrl(media: MediaWithUserId, thumb?: boolean) {
    const filename = thumb
        ? "thumb.webp"
        : `main.${path.extname(media.fileName).replace(".", "")}`;

    const key = generateKey({
        mediaId: media.mediaId,
        path: Constants.PathKey.PRIVATE,
        filename,
    });

    // Private files are always in private bucket
    const bucket = cloudBucket;

    return ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT
        ? generateCloudfrontSignedUrl(key)
        : await generateSignedUrl(key, bucket);
}

/* Where a media item's main file lives: temp and private files in the
   private bucket, sealed public files in the public one. */
function mainFileLocation(media: MediaWithUserId) {
    const isPrivate =
        media.temp || media.accessControl === Constants.AccessControl.PRIVATE;
    const fileExtension = path.extname(media.fileName).replace(".", "");
    return {
        Bucket: isPrivate ? cloudBucket : cloudPublicBucket,
        Key: generateKey({
            mediaId: media.mediaId,
            path: isPrivate
                ? Constants.PathKey.PRIVATE
                : Constants.PathKey.PUBLIC,
            filename: `main.${fileExtension}`,
        }),
    };
}

/* The file's text for text-based native viewers. Null when the file is not
   found. */
async function getTextContent({
    userId,
    appId,
    mediaId,
}: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<
    | { status: "ok"; text: string }
    | { status: "unsupported" }
    | { status: "tooLarge" }
    | null
> {
    const media = await getMedia({ userId, appId, mediaId });
    if (!media) return null;
    if (!isTextPreview(mediaPreview(media.mimeType, media.originalFileName))) {
        return { status: "unsupported" };
    }
    if (media.size > MAX_TEXT_PREVIEW_BYTES) return { status: "tooLarge" };
    const result = await getObjectBytes({
        ...mainFileLocation(media),
        maxBytes: MAX_TEXT_PREVIEW_BYTES,
    });
    if (result.tooLarge) return { status: "tooLarge" };
    return {
        status: "ok",
        text: new TextDecoder("utf-8").decode(result.bytes),
    };
}

/* Removes everything stored for a media item: its whole folder in both
   buckets, so derivatives and leftovers of unfinished seals go too. */
async function removeStoredFiles(media: MediaWithUserId): Promise<void> {
    await deleteMediaFolders(media.mediaId);
}

async function deleteMedia({
    userId,
    appId,
    mediaId,
}: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<void> {
    const media = await getMedia({ userId, appId, mediaId });
    if (!media) return;

    await mediaService.removeStoredFiles(media);
    await deleteMediaQuery(userId, mediaId);
    await sweepAfterDelete(media);
    reportDeleted(media, appId);
}

function reportDeleted(media: MediaWithUserId, appId: string): void {
    const fields = {
        media_id: media.mediaId,
        app_id: appId,
        media_kind: mediaKind(media.mimeType),
        temp: Boolean(media.temp),
    };
    logger.info(fields, "media deleted");
    trackEvent({
        event: "media.deleted",
        source: "media.delete",
        appId,
        userId: String(media.userId),
        properties: fields,
    });
}

/* A seal or job that committed between removing the files and deleting the
   row may have published files since. Anything committing later finds no
   row and removes its own. Failures here are only logged: the row is gone,
   so a retry can't reach them. */
async function sweepAfterDelete(media: MediaWithUserId): Promise<void> {
    try {
        await mediaService.removeStoredFiles(media);
    } catch (err) {
        logger.error(
            { err, media_id: media.mediaId },
            "Failed to remove files published during a delete",
        );
    }
}

const DELETE_CONCURRENCY = 10;

/* Deletes several media items of one app. Looks them all up in one query;
   an id that doesn't exist, or whose files can't be removed, counts as
   failed. */
async function deleteMediaMany({
    userId,
    appId,
    mediaIds,
}: {
    userId: string;
    appId: string;
    mediaIds: string[];
}): Promise<{ deleted: number; failed: number }> {
    const uniqueIds = Array.from(new Set(mediaIds));
    const found = await listMediaRecordsByIds({
        userId,
        appId,
        mediaIds: uniqueIds,
    });

    let deleted = 0;
    for (let start = 0; start < found.length; start += DELETE_CONCURRENCY) {
        const results = await Promise.allSettled(
            found
                .slice(start, start + DELETE_CONCURRENCY)
                .map(async (media) => {
                    await mediaService.removeStoredFiles(media);
                    await deleteMediaQuery(userId, media.mediaId);
                    await sweepAfterDelete(media);
                    reportDeleted(media, appId);
                }),
        );
        for (const result of results) {
            if (result.status === "fulfilled") {
                deleted++;
            } else {
                logger.error({ err: result.reason }, "Failed to delete media");
            }
        }
    }

    return { deleted, failed: uniqueIds.length - deleted };
}

/* Seals temp media (pipelines-phase-0.md, D5): converts it to WebP when the
   app asks for it, publishes it, and returns the sealed media. Already sealed
   media is returned unchanged. */
async function sealMedia({
    userId,
    appId,
    mediaId,
}: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<MediaResponse> {
    await sealStoredMedia({ userId, appId, mediaId });
    const sealed = await getMedia({ userId, appId, mediaId });
    if (!sealed) {
        throw new Error("Media not found");
    }
    return await getMediaResponse(sealed);
}

const mediaService = {
    upload,
    getPage,
    getMediaCount: getMediaCountWithFilter,
    getMediaDetails,
    getTextContent,
    deleteMedia,
    deleteMediaMany,
    removeStoredFiles,
    sealMedia,
};

export default mediaService;
