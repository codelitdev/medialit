import path from "path";
import thumbnail from "@medialit/thumbnail";
import { createReadStream, rmdirSync } from "fs";
import {
    tempFileDirForUploads,
    imagePattern,
    videoPattern,
    imagePatternForThumbnailGeneration,
    ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT,
    DISABLE_TAGGING,
    cloudBucket,
    cloudPublicBucket,
} from "../config/constants";
import imageUtils from "@medialit/images";
import {
    foldersExist,
    createFolders,
    moveFile,
} from "./utils/manage-files-on-disk";
import {
    generateSignedUrl,
    generateCloudfrontSignedUrl,
    putObject,
    deleteObject,
    copyObject,
    getObjectTagging,
    UploadParams,
} from "../services/s3";
import logger from "../services/log";
import generateKey from "./utils/generate-key";
import { getMediaSettings } from "../media-settings/queries";
import generateFileName from "./utils/generate-file-name";
import mongoose from "mongoose";
import GetPageProps from "./GetPageProps";
import {
    deleteMediaQuery,
    getMedia,
    getPaginatedMedia,
    createMedia,
} from "./queries";
import MediaModel from "./model";
import * as presignedUrlService from "../signature/service";
import getTags from "./utils/get-tags";
import { getPublicFileUrl, getThumbnailUrl } from "./utils/get-public-urls";
import { AccessControl, Constants, MediaWithUserId } from "@medialit/models";
import { MediaResponse } from "./schemas";

const generateAndUploadThumbnail = async ({
    workingDirectory,
    key,
    mimetype,
    originalFilePath,
    tags,
    bucket,
}: {
    workingDirectory: string;
    key: string;
    mimetype: string;
    originalFilePath: string;
    tags: string;
    bucket?: string;
}): Promise<boolean> => {
    const thumbPath = `${workingDirectory}/thumb.webp`;

    let isThumbGenerated = false; // to indicate if the thumbnail name is to be saved to the DB
    if (imagePatternForThumbnailGeneration.test(mimetype)) {
        await thumbnail.forImage(originalFilePath, thumbPath);
        isThumbGenerated = true;
    }
    if (videoPattern.test(mimetype)) {
        await thumbnail.forVideo(originalFilePath, thumbPath);
        isThumbGenerated = true;
    }

    if (isThumbGenerated) {
        await putObject({
            Key: key,
            Body: createReadStream(thumbPath),
            ContentType: "image/webp",
            Tagging: tags,
            Bucket: bucket || cloudBucket,
        });
    }

    return isThumbGenerated;
};

interface UploadProps {
    userId: string;
    apikey: string;
    file: any;
    access: string;
    caption: string;
    group?: string;
    signature?: string;
}

async function upload({
    userId,
    apikey,
    file,
    access,
    caption,
    group,
    signature,
}: UploadProps): Promise<string> {
    const fileName = generateFileName(file.name);
    const mediaSettings = await getMediaSettings(userId, apikey);
    const useWebP = mediaSettings?.useWebP || false;
    const webpOutputQuality = mediaSettings?.webpOutputQuality || 0;

    const temporaryFolderForWork = `${tempFileDirForUploads}/${fileName.name}`;
    if (!foldersExist([temporaryFolderForWork])) {
        createFolders([temporaryFolderForWork]);
    }

    let fileExtension = fileName.ext;
    let mimeType = file.mimetype;
    if (useWebP && imagePattern.test(mimeType)) {
        fileExtension = "webp";
        mimeType = "image/webp";
    }

    const mainFilePath = `${temporaryFolderForWork}/main.${fileExtension}`;
    await moveFile(file, mainFilePath);
    if (useWebP && imagePattern.test(file.mimetype)) {
        await imageUtils.convertToWebp(mainFilePath, webpOutputQuality);
    }

    const uploadParams: UploadParams = {
        Key: generateKey({
            mediaId: fileName.name,
            path: Constants.PathKey.PRIVATE,
            filename: `main.${fileExtension}`,
        }),
        Body: createReadStream(mainFilePath),
        ContentType: mimeType,
        Bucket: cloudBucket,
    };
    const tags = getTags(userId, group);
    uploadParams.Tagging = tags;

    await putObject(uploadParams);

    let isThumbGenerated = false;
    try {
        isThumbGenerated = await generateAndUploadThumbnail({
            workingDirectory: temporaryFolderForWork,
            mimetype: file.mimetype,
            originalFilePath: mainFilePath,
            key: generateKey({
                mediaId: fileName.name,
                path: Constants.PathKey.PRIVATE,
                filename: "thumb.webp",
            }),
            tags,
            bucket: cloudBucket,
        });
    } catch (err: any) {
        logger.error({ err }, err.message);
    }

    rmdirSync(temporaryFolderForWork, { recursive: true });

    const mediaObject: MediaWithUserId = {
        fileName: `main.${fileExtension}`,
        mediaId: fileName.name,
        userId: new mongoose.Types.ObjectId(userId),
        apikey,
        originalFileName: file.name,
        mimeType,
        size: file.size,
        thumbnailGenerated: isThumbGenerated,
        caption,
        accessControl:
            access === Constants.AccessControl.PUBLIC
                ? Constants.AccessControl.PUBLIC
                : Constants.AccessControl.PRIVATE,
        group,
        temp: true,
    };
    const media = await createMedia(mediaObject);

    if (signature) {
        presignedUrlService.cleanup(userId, signature).catch((err: any) => {
            logger.error(
                { err },
                `Error in cleaning up expired links for ${userId}`,
            );
        });
    }

    return media.mediaId;
}

type MappedMedia = Partial<
    Omit<Omit<MediaWithUserId, "accessControl" | "temp">, "thumbnailGenerated">
> & {
    access: AccessControl;
    thumbnail: string;
};

async function getPage({
    userId,
    apikey,
    access,
    page,
    group,
    recordsPerPage,
}: GetPageProps): Promise<MappedMedia[]> {
    const result = await getPaginatedMedia({
        userId,
        apikey,
        access,
        page,
        group,
        recordsPerPage,
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
        }),
    );

    return mappedResult;
}

async function getMediaDetails({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<MediaResponse | null> {
    const media: MediaWithUserId | null = await getMedia({
        userId,
        apikey,
        mediaId,
    });
    if (!media) {
        return null;
    }

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

async function deleteMedia({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<void> {
    const media = await getMedia({ userId, apikey, mediaId });
    if (!media) return;

    // Determine which bucket the main file is in
    const mainBucket =
        media.temp || media.accessControl === Constants.AccessControl.PRIVATE
            ? cloudBucket
            : cloudPublicBucket;

    const mainPath =
        media.temp || media.accessControl === Constants.AccessControl.PRIVATE
            ? Constants.PathKey.PRIVATE
            : Constants.PathKey.PUBLIC;

    const fileExtension = path.extname(media.fileName).replace(".", "");
    const key = generateKey({
        mediaId,
        path: mainPath,
        filename: `main.${fileExtension}`,
    });
    await deleteObject({ Key: key, Bucket: mainBucket });

    if (media.thumbnailGenerated) {
        // Thumbnails are in public bucket if sealed, private bucket if temp
        const thumbBucket = media.temp ? cloudBucket : cloudPublicBucket;
        const thumbPath = media.temp
            ? Constants.PathKey.PRIVATE
            : Constants.PathKey.PUBLIC;
        const thumbKey = generateKey({
            mediaId,
            path: thumbPath,
            filename: "thumb.webp",
        });
        await deleteObject({ Key: thumbKey, Bucket: thumbBucket });
    }

    await deleteMediaQuery(userId, mediaId);
}

async function sealMedia({
    userId,
    apikey,
    mediaId,
}: {
    userId: string;
    apikey: string;
    mediaId: string;
}): Promise<MediaWithUserId> {
    const media = await getMedia({ userId, apikey, mediaId });
    if (!media) {
        throw new Error("Media not found");
    }

    if (!media.temp) {
        return media;
    }

    const fileExtension = path.extname(media.fileName).replace(".", "");

    // Get tags from source object (in private bucket)
    const tmpMainKey = generateKey({
        mediaId,
        path: Constants.PathKey.PRIVATE,
        filename: `main.${fileExtension}`,
    });
    let tags: string | undefined;
    if (!DISABLE_TAGGING) {
        try {
            const taggingResponse = await getObjectTagging({
                Key: tmpMainKey,
                Bucket: cloudBucket,
            });
            if (taggingResponse.TagSet && taggingResponse.TagSet.length > 0) {
                tags = taggingResponse.TagSet.map(
                    (tag: any) => `${tag.Key}=${tag.Value}`,
                ).join("&");
            }
        } catch (err: any) {
            logger.warn({ err }, "Failed to get tags from source object");
        }
    }

    // Determine destination bucket for main file
    const isPublic = media.accessControl === Constants.AccessControl.PUBLIC;

    // Copy main file from private bucket to public bucket (only if public)
    if (isPublic) {
        const finalMainKey = generateKey({
            mediaId,
            path: Constants.PathKey.PUBLIC,
            filename: `main.${fileExtension}`,
        });

        await copyObject({
            sourceKey: tmpMainKey,
            sourceBucket: cloudBucket,
            destinationKey: finalMainKey,
            destinationBucket: cloudPublicBucket,
            ContentType: media.mimeType,
            Tagging: tags,
        });
    }

    // Copy thumbnail from private bucket to public bucket (if exists)
    if (media.thumbnailGenerated) {
        const tmpThumbKey = generateKey({
            mediaId,
            path: Constants.PathKey.PRIVATE,
            filename: "thumb.webp",
        });
        const finalThumbKey = generateKey({
            mediaId,
            path: Constants.PathKey.PUBLIC,
            filename: "thumb.webp",
        });

        await copyObject({
            sourceKey: tmpThumbKey,
            sourceBucket: cloudBucket,
            destinationKey: finalThumbKey,
            destinationBucket: cloudPublicBucket,
            ContentType: "image/webp",
            Tagging: tags,
        });

        // Delete thumbnail from private bucket (it's now in public bucket)
        await deleteObject({
            Key: tmpThumbKey,
            Bucket: cloudBucket,
        });
    }

    // Delete main file from private bucket only if it was copied to public bucket
    if (isPublic) {
        await deleteObject({
            Key: tmpMainKey,
            Bucket: cloudBucket,
        });
    }

    // Update media record to remove temp flag
    await MediaModel.updateOne(
        { mediaId, userId, apikey },
        { $unset: { temp: "" } },
    );

    // Fetch and return the updated media
    const updatedMedia = await getMedia({ userId, apikey, mediaId });
    if (!updatedMedia) {
        throw new Error("Failed to retrieve updated media");
    }
    return updatedMedia;
}

export default {
    upload,
    getPage,
    getMediaDetails,
    deleteMedia,
    sealMedia,
};
