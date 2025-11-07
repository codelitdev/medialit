import {
    createReadStream,
    existsSync,
    copyFileSync,
    promises as fsPromises,
} from "fs";
import path from "path";
import thumbnail from "@medialit/thumbnail";
import mongoose from "mongoose";
import {
    tempFileDirForUploads,
    imagePattern,
    imagePatternForThumbnailGeneration,
    videoPattern,
    cloudBucket,
} from "../config/constants";
import imageUtils from "@medialit/images";
import {
    foldersExist,
    createFolders,
} from "../media/utils/manage-files-on-disk";
import { Constants, type MediaWithUserId } from "@medialit/models";
import { putObject, UploadParams } from "../services/s3";
import logger from "../services/log";
import generateKey, { PATH_KEY } from "../media/utils/generate-key";
import { getMediaSettings } from "../media-settings/queries";
import generateFileName from "../media/utils/generate-file-name";
import { createMedia } from "../media/queries";
import getTags from "../media/utils/get-tags";
import { getTusUpload, markTusUploadComplete } from "./queries";
import * as presignedUrlService from "../signature/service";
import { getUser } from "../user/queries";
import { hasEnoughStorage } from "../media/storage-middleware";
import { NOT_ENOUGH_STORAGE } from "../config/strings";
import { removeTusFiles } from "./utils";

export default async function finalizeUpload(
    uploadId: string,
): Promise<string> {
    const tusUpload = await getTusUpload(uploadId);
    if (!tusUpload) {
        throw new Error(`Tus upload not found: ${uploadId}`);
    }

    if (tusUpload.isComplete) {
        logger.info({ uploadId }, "Upload already finalized");
        return "";
    }

    const { userId, apikey, metadata, uploadLength, tempFilePath, signature } =
        tusUpload;

    const user = await getUser(userId);
    if (!(await hasEnoughStorage(uploadLength, user!))) {
        throw new Error(NOT_ENOUGH_STORAGE);
    }

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
    const fileName = generateFileName(metadata.fileName);
    const temporaryFolderForWork = `${tempFileDirForUploads}/${fileName.name}`;
    if (!foldersExist([temporaryFolderForWork])) {
        createFolders([temporaryFolderForWork]);
    }

    let fileExtension = path.extname(metadata.fileName).replace(".", "");
    let mimeType = metadata.mimeType;
    if (useWebP && imagePattern.test(mimeType)) {
        fileExtension = "webp";
        mimeType = "image/webp";
    }

    const mainFilePath = `${temporaryFolderForWork}/main.${fileExtension}`;

    copyFileSync(tusFilePath, mainFilePath);

    // Apply WebP conversion if needed
    if (useWebP && imagePattern.test(metadata.mimeType)) {
        await imageUtils.convertToWebp(mainFilePath, webpOutputQuality);
    }

    const uploadParams: UploadParams = {
        Key: generateKey({
            mediaId: fileName.name,
            path: PATH_KEY.PRIVATE,
            filename: `main.${fileExtension}`,
        }),
        Body: createReadStream(mainFilePath),
        ContentType: mimeType,
        Bucket: cloudBucket,
    };
    const tags = getTags(userId, metadata.group);
    uploadParams.Tagging = tags;

    await putObject(uploadParams);

    let isThumbGenerated = false;
    try {
        isThumbGenerated = await generateAndUploadThumbnail({
            workingDirectory: temporaryFolderForWork,
            mimetype: metadata.mimeType,
            originalFilePath: mainFilePath,
            key: generateKey({
                mediaId: fileName.name,
                path: PATH_KEY.PRIVATE,
                filename: "thumb.webp",
            }),
            tags,
            bucket: cloudBucket,
        });
    } catch (err: any) {
        logger.error({ err }, err.message);
    }

    await fsPromises.rm(temporaryFolderForWork, { recursive: true });

    const mediaObject = {
        fileName: `main.${fileExtension}`,
        mediaId: fileName.name,
        userId: new mongoose.Types.ObjectId(userId),
        apikey,
        originalFileName: metadata.fileName,
        mimeType,
        size: uploadLength,
        thumbnailGenerated: isThumbGenerated,
        caption: metadata.caption,
        // accessControl:
        //     metadata.accessControl === "public" ? "public-read" : "private",
        accessControl:
            metadata.accessControl === Constants.AccessControl.PUBLIC
                ? Constants.AccessControl.PUBLIC
                : Constants.AccessControl.PRIVATE,
        group: metadata.group,
        temp: true,
    } as MediaWithUserId;
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
            removeTusFiles(tempFilePath);
        }
    } catch (err) {
        logger.error({ err }, "Error cleaning up tus file");
    }

    return media.mediaId;
}

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
    let isGenerated = false;

    if (imagePatternForThumbnailGeneration.test(mimetype)) {
        await thumbnail.forImage(originalFilePath, thumbPath);
        isGenerated = true;
    }
    if (videoPattern.test(mimetype)) {
        await thumbnail.forVideo(originalFilePath, thumbPath);
        isGenerated = true;
    }

    if (isGenerated) {
        await putObject({
            Key: key,
            Body: createReadStream(thumbPath),
            ContentType: "image/webp",
            Tagging: tags,
            Bucket: bucket || cloudBucket,
        });
        await fsPromises.rm(thumbPath);
    }

    return isGenerated;
};
