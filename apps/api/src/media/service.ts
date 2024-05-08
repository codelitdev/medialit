import path from "path";
import thumbnail from "@medialit/thumbnail";
import { createReadStream, rmdirSync } from "fs";
import {
    tempFileDirForUploads,
    imagePattern,
    videoPattern,
    thumbnailWidth,
    thumbnailHeight,
    imagePatternIncludingGif,
} from "../config/constants";
import imageUtils from "@medialit/images";
import {
    foldersExist,
    createFolders,
    moveFile,
} from "./utils/manage-files-on-disk";
import type { MediaWithUserId } from "./model";
import {
    generateSignedUrl,
    putObject,
    deleteObject,
    UploadParams,
    getObjectTagging as objectTagging,
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
import * as presignedUrlService from "../presigning/service";
import getTags from "./utils/get-tags";
import { getMainFileUrl, getThumbnailUrl } from "./utils/get-public-urls";

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

    let isThumbGenerated = false; // to indicate if the thumbnail name is to be saved to the DB
    if (imagePatternIncludingGif.test(mimetype)) {
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
            ACL: "public-read",
            Tagging: tags,
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
            access: access === "public" ? "public" : "private",
            filename: `main.${fileExtension}`,
            // extension: fileExtension,
            // type: "main",
        }),
        Body: createReadStream(mainFilePath),
        ContentType: mimeType,
        ACL: access === "public" ? "public-read" : "private",
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
                access: "public",
                filename: "thumb.webp",
                // type: "thumb",
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
        originalFileName: file.name,
        mimeType,
        size: file.size,
        thumbnailGenerated: isThumbGenerated,
        caption,
        accessControl: access === "public" ? "public-read" : "private",
        group,
    };
    const media = await createMedia(mediaObject);

    if (signature) {
        presignedUrlService.cleanup(userId, signature).catch((err: any) => {
            logger.error(
                { err },
                `Error in cleaning up expired links for ${userId}`
            );
        });
    }

    return media.mediaId;
}

type MappedMedia = Partial<
    Omit<Omit<MediaWithUserId, "accessControl">, "thumbnailGenerated">
> & {
    access: "private" | "public";
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
        (media: MediaWithUserId): MappedMedia => ({
            mediaId: media.mediaId,
            originalFileName: media.originalFileName,
            mimeType: media.mimeType,
            size: media.size,
            access: media.accessControl === "private" ? "private" : "public",
            thumbnail: media.thumbnailGenerated
                ? getThumbnailUrl(media.mediaId)
                : "",
            caption: media.caption,
            group: media.group,
        })
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
}): Promise<Record<string, unknown> | null> {
    const media: MediaWithUserId | null = await getMedia({
        userId,
        apikey,
        mediaId,
    });
    if (!media) {
        return null;
    }

    return {
        mediaId: media.mediaId,
        originalFileName: media.originalFileName,
        mimeType: media.mimeType,
        size: media.size,
        access: media.accessControl === "private" ? "private" : "public",
        file:
            media.accessControl === "private"
                ? await generateSignedUrl({
                      name: generateKey({
                          mediaId: media.mediaId,
                          access:
                              media.accessControl === "private"
                                  ? "private"
                                  : "public",
                          filename: `main.${path
                              .extname(media.fileName)
                              .replace(".", "")}`,
                          //   extension: path
                          //       .extname(media.fileName)
                          //       .replace(".", ""),
                          //   type: "main",
                      }),
                  })
                : getMainFileUrl(media),
        thumbnail: media.thumbnailGenerated
            ? getThumbnailUrl(media.mediaId)
            : "",
        caption: media.caption,
        group: media.group,
    };
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

    const key = generateKey({
        mediaId,
        access: media.accessControl === "private" ? "private" : "public",
        filename: `main.${media.fileName.split(".")[1]}`,
        // extension: media.mimeType.split("/")[1],
        // type: "main",
    });
    await deleteObject({ Key: key });

    if (media.thumbnailGenerated) {
        const thumbKey = generateKey({
            mediaId,
            access: "public",
            filename: "thumb.webp",
            // extension: media.mimeType.split("/")[1],
            // type: "thumb",
        });
        await deleteObject({ Key: thumbKey });
    }

    await deleteMediaQuery(userId, mediaId);
}

export default {
    upload,
    getPage,
    getMediaDetails,
    deleteMedia,
};
