import Joi from "joi";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../config/constants";
import {
    FILE_IS_REQUIRED,
    FILE_SIZE_EXCEEDED,
    NOT_FOUND,
    SUCCESS,
} from "../config/strings";
import logger from "../services/log";
import { Request } from "express";
import mediaService from "./service";
import { getMediaCount as getCount, getTotalSpace } from "./queries";
import { Constants, getSubscriptionStatus } from "@medialit/models";
import ChunkedUploadModel, { ChunkedUpload } from "./chunked-upload-model";
import { getUniqueId } from "@medialit/utils";
import { createReadStream, createWriteStream, existsSync, rename } from "fs";
import { join } from "path";
import { tempFileDirForUploads } from "../config/constants";
import * as presignedUrlService from "../presigning/service";

function validateUploadOptions(req: Request): Joi.ValidationResult {
    const uploadSchema = Joi.object({
        caption: Joi.string().optional().allow(""),
        access: Joi.string().valid("public", "private").optional(),
        group: Joi.string().optional(),
    });
    const { caption, access, group } = req.body;
    return uploadSchema.validate({ caption, access, group });
}

function getMaxFileUploadSize(req: any): number {
    return getSubscriptionStatus(req.user)
        ? maxFileUploadSizeSubscribed
        : maxFileUploadSizeNotSubscribed;
}

export async function uploadMedia(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    req.socket.setTimeout(10 * 60 * 1000);

    if (!req.files || !req.files.file) {
        return res.status(400).json({ error: FILE_IS_REQUIRED });
    }

    const allowedFileSize = getMaxFileUploadSize(req);
    if (req.files.file.size > allowedFileSize) {
        return res.status(400).json({
            error: `${FILE_SIZE_EXCEEDED}. Allowed: ${allowedFileSize} bytes`,
        });
    }

    const { error } = validateUploadOptions(req);
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    const { file } = req.files;
    const { access, caption, group } = req.body;
    const userId = req.user.id;
    const apikey = req.apikey;

    try {
        const mediaId = await mediaService.upload({
            userId,
            apikey,
            file,
            access,
            caption,
            group,
            signature: req.query.signature,
        });

        const media = await mediaService.getMediaDetails({
            userId: req.user.id,
            apikey,
            mediaId,
        });

        // Filter out the 'group' field to match MediaInput GraphQL type
        const { group: _, ...mediaResponse } = media as any;
        return res.status(200).json(mediaResponse);
    } catch (err: any) {
        logger.error({ err }, err.message);
        res.status(500).json({ error: err.message });
    }
}

export async function getMedia(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const getMediaSchema = Joi.object({
        page: Joi.number().positive(),
        limit: Joi.number().positive(),
        access: Joi.string().valid("public", "private"),
        group: Joi.string(),
    });

    const { page, limit, access, group } = req.query;

    const { error } = getMediaSchema.validate({ page, limit, access, group });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const result = await mediaService.getPage({
            userId: req.user._id,
            apikey: req.apikey,
            access,
            page,
            group,
            recordsPerPage: limit,
        });
        return res.status(200).json(result);
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json(err.message);
    }
}

export async function getMediaCount(req: any, res: any) {
    const userId = req.user._id;
    const apikey = req.apikey;

    try {
        const totalMediaFiles = await getCount({ userId, apikey });
        return res.status(200).json({ count: totalMediaFiles });
    } catch (err: any) {
        return res.status(500).json(err.message);
    }
}

export async function getTotalSpaceOccupied(req: any, res: any) {
    const userId = req.user._id;
    const apikey = req.apikey;

    try {
        const totalSpaceOccupied = await getTotalSpace({ userId, apikey });
        return res.status(200).json({
            storage: totalSpaceOccupied,
            maxStorage: getSubscriptionStatus(req.user)
                ? maxStorageAllowedSubscribed
                : maxStorageAllowedNotSubscribed,
        });
    } catch (err: any) {
        return res.status(500).json(err.message);
    }
}

export async function getMediaDetails(req: any, res: any) {
    const { mediaId } = req.params;

    try {
        const media = await mediaService.getMediaDetails({
            userId: req.user.id,
            apikey: req.apikey,
            mediaId,
        });
        if (!media) {
            return res.status(404).json({ error: NOT_FOUND });
        }

        return res.status(200).json(media);
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json(err.message);
    }
}

export async function deleteMedia(req: any, res: any) {
    const { mediaId } = req.params;

    try {
        await mediaService.deleteMedia({
            userId: req.user.id,
            apikey: req.apikey,
            mediaId,
        });

        return res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json(err.message);
    }
}

export async function initializeChunkedUpload(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const { error } = validateChunkedUploadInitOptions(req);
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    const {
        fileName,
        fileSize,
        mimeType,
        totalChunks,
        access,
        caption,
        group,
    } = req.body;
    const userId = req.user.id;
    const apikey = req.apikey;

    // Check file size limits
    const allowedFileSize = getMaxFileUploadSize(req);
    if (fileSize > allowedFileSize) {
        return res.status(400).json({
            error: `${FILE_SIZE_EXCEEDED}. Allowed: ${allowedFileSize} bytes`,
        });
    }

    try {
        const uploadId = getUniqueId();
        const chunkedUpload = new ChunkedUploadModel({
            uploadId,
            userId,
            apikey,
            fileName: `${uploadId}_${fileName}`,
            originalFileName: fileName,
            mimeType,
            totalSize: fileSize,
            totalChunks,
            uploadedChunks: [],
            chunks: [],
            access: access || "private",
            caption: caption || "",
            group,
            signature: req.query.signature,
        });

        await chunkedUpload.save();

        return res.status(200).json({
            uploadId,
            message: "Chunked upload initialized",
        });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function uploadChunk(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const uploadId: string = req.params.uploadId;
    const { chunkNumber } = req.body;

    if (!uploadId) {
        return res.status(400).json({ error: "Upload ID is required" });
    }

    if (!req.files || !req.files.chunk) {
        return res.status(400).json({ error: "Chunk file is required" });
    }

    try {
        const chunkedUpload = await ChunkedUploadModel.findOne({ uploadId });
        if (!chunkedUpload) {
            return res.status(404).json({ error: "Upload session not found" });
        }

        // Check if chunk already uploaded
        if (chunkedUpload.uploadedChunks.includes(parseInt(chunkNumber))) {
            return res.status(200).json({ message: "Chunk already uploaded" });
        }

        const chunk = req.files.chunk;
        const chunkDir = join(tempFileDirForUploads || "/tmp", uploadId);

        // Create directory if it doesn't exist
        if (!existsSync(chunkDir)) {
            require("fs").mkdirSync(chunkDir, { recursive: true });
        }

        const chunkPath = join(chunkDir, `chunk_${chunkNumber}`);

        // Move chunk to temporary location
        await chunk.mv(chunkPath);

        // Update chunked upload record
        chunkedUpload.uploadedChunks.push(parseInt(chunkNumber));
        chunkedUpload.chunks.push({
            chunkNumber: parseInt(chunkNumber),
            size: chunk.size,
            filePath: chunkPath,
        });

        await chunkedUpload.save();

        return res.status(200).json({
            message: "Chunk uploaded successfully",
            uploadedChunks: chunkedUpload.uploadedChunks.length,
            totalChunks: chunkedUpload.totalChunks,
        });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function completeChunkedUpload(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const uploadId: string = req.params.uploadId;

    if (!uploadId) {
        return res.status(400).json({ error: "Upload ID is required" });
    }

    try {
        const chunkedUpload = await ChunkedUploadModel.findOne({ uploadId });
        if (!chunkedUpload) {
            return res.status(404).json({ error: "Upload session not found" });
        }

        // Check if all chunks are uploaded
        if (chunkedUpload.uploadedChunks.length !== chunkedUpload.totalChunks) {
            return res.status(400).json({
                error: "Not all chunks uploaded",
                uploaded: chunkedUpload.uploadedChunks.length,
                total: chunkedUpload.totalChunks,
            });
        }

        // Sort chunks by chunk number
        const sortedChunks = chunkedUpload.chunks.sort(
            (a: any, b: any) => a.chunkNumber - b.chunkNumber,
        );

        // Combine chunks into final file
        const finalFilePath = join(
            tempFileDirForUploads || "/tmp",
            chunkedUpload.fileName,
        );
        const writeStream = createWriteStream(finalFilePath);

        for (const chunk of sortedChunks) {
            const readStream = createReadStream(chunk.filePath);
            await new Promise<void>((resolve, reject) => {
                readStream.pipe(writeStream, { end: false });
                readStream.on("end", () => resolve());
                readStream.on("error", reject);
            });
        }

        writeStream.end();

        // Create a file-like object for the existing upload service
        const combinedFile = {
            name: chunkedUpload.originalFileName,
            size: chunkedUpload.totalSize,
            mimetype: chunkedUpload.mimeType,
            tempFilePath: finalFilePath,
            mv: (destination: string, callback: (err?: any) => void) => {
                // Since the file is already at finalFilePath, we need to move it to destination
                rename(finalFilePath, destination, callback);
            }
        };

        // Upload using existing service
        const mediaId = await mediaService.upload({
            userId: chunkedUpload.userId.toString(),
            apikey: chunkedUpload.apikey,
            file: combinedFile,
            access: chunkedUpload.access,
            caption: chunkedUpload.caption,
            group: chunkedUpload.group,
            signature: chunkedUpload.signature,
        });

        // Get media details
        const media = await mediaService.getMediaDetails({
            userId: chunkedUpload.userId.toString(),
            apikey: chunkedUpload.apikey,
            mediaId,
        });

        // Cleanup
        await cleanupChunkedUpload(uploadId as string);

        if (chunkedUpload.signature) {
            presignedUrlService
                .cleanup(
                    chunkedUpload.userId.toString(),
                    chunkedUpload.signature,
                )
                .catch((err: any) => {
                    logger.error(
                        { err },
                        `Error in cleaning up expired links for ${chunkedUpload.userId}`,
                    );
                });
        }

        // Filter out the 'group' field to match MediaInput GraphQL type
        const { group: _, ...mediaResponse } = media as any;
        return res.status(200).json(mediaResponse);
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function abortChunkedUpload(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const uploadId: string = req.params.uploadId;

    if (!uploadId) {
        return res.status(400).json({ error: "Upload ID is required" });
    }

    try {
        await cleanupChunkedUpload(uploadId as string);
        return res.status(200).json({ message: "Upload aborted successfully" });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

function validateChunkedUploadInitOptions(req: Request): Joi.ValidationResult {
    const schema = Joi.object({
        fileName: Joi.string().required(),
        fileSize: Joi.number().required().min(1),
        mimeType: Joi.string().required(),
        totalChunks: Joi.number().required().min(1),
        access: Joi.string().valid("public", "private").optional(),
        caption: Joi.string().optional().allow(""),
        group: Joi.string().optional(),
    });
    const {
        fileName,
        fileSize,
        mimeType,
        totalChunks,
        access,
        caption,
        group,
    } = req.body;
    return schema.validate({
        fileName,
        fileSize,
        mimeType,
        totalChunks,
        access,
        caption,
        group,
    });
}

async function cleanupChunkedUpload(uploadId: string) {
    try {
        const chunkedUpload = await ChunkedUploadModel.findOne({ uploadId });
        if (chunkedUpload) {
            // Delete chunk files
            for (const chunk of chunkedUpload.chunks) {
                if (existsSync(chunk.filePath)) {
                    require("fs").unlinkSync(chunk.filePath);
                }
            }

            // Delete chunk directory
            const chunkDir = join(tempFileDirForUploads || "/tmp", uploadId);
            if (existsSync(chunkDir)) {
                require("fs").rmSync(chunkDir, {
                    recursive: true,
                    force: true,
                });
            }

            // Delete final file if exists
            if (chunkedUpload.fileName) {
                const finalFilePath = join(
                    tempFileDirForUploads || "/tmp",
                    chunkedUpload.fileName,
                );
                if (existsSync(finalFilePath)) {
                    require("fs").unlinkSync(finalFilePath);
                }
            }

            // Delete database record
            await ChunkedUploadModel.deleteOne({ uploadId });
        }
    } catch (err: any) {
        logger.error(
            { err },
            `Error cleaning up chunked upload ${uploadId}: ${err.message}`,
        );
    }
}
