import { readFileSync, createReadStream, rmdirSync, existsSync } from "fs";
import path from "path";
import thumbnail from "@medialit/thumbnail";
import mongoose from "mongoose";
import {
    tempFileDirForUploads,
    imagePattern,
    imagePatternForThumbnailGeneration,
    videoPattern,
    USE_CLOUDFRONT,
} from "../config/constants";
import imageUtils from "@medialit/images";
import {
    foldersExist,
    createFolders,
} from "../media/utils/manage-files-on-disk";
import type { MediaWithUserId } from "../media/model";
import { putObject, UploadParams } from "../services/s3";
import logger from "../services/log";
import generateKey from "../media/utils/generate-key";
import { getMediaSettings } from "../media-settings/queries";
import generateFileName from "../media/utils/generate-file-name";
import { createMedia } from "../media/queries";
import getTags from "../media/utils/get-tags";
import { getTusUpload, markTusUploadComplete } from "./queries";
import * as presignedUrlService from "../presigning/service";

const generateAndUploadThumbnail = async ({
    workingDirectory,
    key,
    mimetype,
    originalFilePath,
    tags,
}: {
    workingDirectory: string;
    key: string;
    mimetype: string;
    originalFilePath: string;
    tags: string;
}): Promise<boolean> => {
    const thumbPath = `${workingDirectory}/thumb.webp`;

    let isThumbGenerated = false;
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
            ACL: USE_CLOUDFRONT ? "private" : "public-read",
            Tagging: tags,
        });
    }

    return isThumbGenerated;
};

export default async function finalizeUpload(uploadId: string) {
    logger.info({ uploadId }, "Finalizing tus upload");

    const tusUpload = await getTusUpload(uploadId);
    if (!tusUpload) {
        throw new Error(`Tus upload not found: ${uploadId}`);
    }

    if (tusUpload.isComplete) {
        logger.info({ uploadId }, "Upload already finalized");
        return;
    }

    const { userId, apikey, metadata, uploadLength, tempFilePath, signature } =
        tusUpload;

    // Read the completed file from tus data store
    const tusFilePath = path.join(
        `${tempFileDirForUploads}/tus-uploads`,
        tempFilePath,
    );

    if (!existsSync(tusFilePath)) {
        logger.error({ uploadId, tusFilePath }, "Tus file not found");
        throw new Error(`Tus file not found: ${tusFilePath}`);
    }

    const mediaSettings = await getMediaSettings(userId, apikey);
    const useWebP = mediaSettings?.useWebP || false;
    const webpOutputQuality = mediaSettings?.webpOutputQuality || 0;

    // Generate unique media ID
    const fileName = generateFileName(metadata.filename);
    const temporaryFolderForWork = `${tempFileDirForUploads}/${fileName.name}`;
    if (!foldersExist([temporaryFolderForWork])) {
        createFolders([temporaryFolderForWork]);
    }

    let fileExtension = path.extname(metadata.filename).replace(".", "");
    let mimeType = metadata.mimetype;
    if (useWebP && imagePattern.test(mimeType)) {
        fileExtension = "webp";
        mimeType = "image/webp";
    }

    const mainFilePath = `${temporaryFolderForWork}/main.${fileExtension}`;

    // Copy file from tus store to working directory
    const tusFileContent = readFileSync(tusFilePath);
    require("fs").writeFileSync(mainFilePath, tusFileContent);

    // Apply WebP conversion if needed
    if (useWebP && imagePattern.test(metadata.mimetype)) {
        await imageUtils.convertToWebp(mainFilePath, webpOutputQuality);
    }

    const uploadParams: UploadParams = {
        Key: generateKey({
            mediaId: fileName.name,
            access: metadata.access === "public" ? "public" : "private",
            filename: `main.${fileExtension}`,
        }),
        Body: createReadStream(mainFilePath),
        ContentType: mimeType,
        ACL: USE_CLOUDFRONT
            ? "private"
            : metadata.access === "public"
              ? "public-read"
              : "private",
    };
    const tags = getTags(userId, metadata.group);
    uploadParams.Tagging = tags;

    await putObject(uploadParams);

    let isThumbGenerated = false;
    try {
        isThumbGenerated = await generateAndUploadThumbnail({
            workingDirectory: temporaryFolderForWork,
            mimetype: metadata.mimetype,
            originalFilePath: mainFilePath,
            key: generateKey({
                mediaId: fileName.name,
                access: "public",
                filename: "thumb.webp",
            }),
            tags,
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
        originalFileName: metadata.filename,
        mimeType,
        size: uploadLength,
        thumbnailGenerated: isThumbGenerated,
        caption: metadata.caption,
        accessControl: metadata.access === "public" ? "public-read" : "private",
        group: metadata.group,
    };
    const media = await createMedia(mediaObject);

    // Mark upload as complete
    await markTusUploadComplete(uploadId);

    // Cleanup presigned URL if used
    if (signature) {
        presignedUrlService.cleanup(userId, signature).catch((err: any) => {
            logger.error(
                { err },
                `Error in cleaning up expired links for ${userId}`,
            );
        });
    }

    // Cleanup tus file
    try {
        if (existsSync(tusFilePath)) {
            require("fs").unlinkSync(tusFilePath);
        }
    } catch (err) {
        logger.error({ err }, "Error cleaning up tus file");
    }

    logger.info(
        { uploadId, mediaId: media.mediaId },
        "Tus upload finalized successfully",
    );

    return media.mediaId;
}
