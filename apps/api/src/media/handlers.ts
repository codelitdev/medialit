import Joi from "joi";
import { NOT_ENOUGH_STORAGE, NOT_FOUND, SUCCESS } from "../config/strings";
import logger from "../services/log";
import { Request } from "express";
import mediaService from "./service";
import { getMediaCount as getCount, getTotalSpace } from "./queries";
import { maxStorageFor, maxUploadFor } from "../billing/entitlements";
import {
    maxFileUploadSizeSubscribed,
    UPLOAD_HEARTBEAT_MS,
} from "../config/constants";
import { touchUploadingMediaRecord } from "@/db";
import { abandonUpload, finalizeStoredUpload, startUpload } from "./ingest";
import { MULTIPART_OVERHEAD_BYTES } from "./upload-guards";
import {
    receiveMultipartUpload,
    UploadRejectedError,
    type ReceivedUpload,
} from "./multipart-upload";
import { getSignatureFromReq } from "../signature/utils";
import { getMediaSchema, uploadMediaSchema } from "./schemas";

function validateUploadOptions(
    fields: Record<string, string>,
): Joi.ValidationResult {
    const { caption, access, group } = fields;
    return uploadMediaSchema.validate({ caption, access, group });
}

export async function uploadMedia(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    req.socket.setTimeout(10 * 60 * 1000); // 10 minutes

    const userId = req.user.id;
    const appId = req.appId;

    let received: ReceivedUpload;
    try {
        const maxFileSize = Math.min(
            await maxUploadFor({ id: req.user._id ?? req.user.id }),
            maxFileUploadSizeSubscribed,
        );
        // Content-Length covers the whole form; the file is most of it.
        const declared = Number(req.headers["content-length"]);
        const declaredSize = Number.isFinite(declared)
            ? Math.max(0, declared - MULTIPART_OVERHEAD_BYTES)
            : 0;
        received = await receiveMultipartUpload(req, {
            maxFileSize,
            begin: async (target, file) => {
                await startUpload(target, {
                    userId,
                    appId,
                    originalFileName: file.originalFileName,
                    mimeType: file.mimeType,
                    declaredSize,
                });
                // Tells the stale-upload sweep this upload is alive, however
                // long a big file on a slow link takes.
                const heartbeat = setInterval(() => {
                    touchUploadingMediaRecord(target.mediaId).catch(() => {});
                }, UPLOAD_HEARTBEAT_MS);
                res.on("close", () => clearInterval(heartbeat));
            },
        });
    } catch (err: any) {
        if (err instanceof UploadRejectedError) {
            return res.status(err.status).json({ error: err.message });
        }
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }

    const { error } = validateUploadOptions(received.fields);
    if (error) {
        await abandonUpload(received);
        return res.status(400).json({ error: error.message });
    }

    const { access, caption } = received.fields;
    // A signature's group wins over the form's.
    const group = req.group ?? received.fields.group;

    try {
        const mediaId = await finalizeStoredUpload({
            mediaId: received.mediaId,
            ext: received.ext,
            key: received.key,
            userId,
            appId,
            originalFileName: received.originalFileName,
            mimeType: received.mimeType,
            access,
            caption,
            group,
            signature: getSignatureFromReq(req),
        });

        const media = await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId,
        });

        return res.status(200).json(media);
    } catch (err: any) {
        if (err.message === NOT_ENOUGH_STORAGE) {
            return res.status(403).json({ error: err.message });
        }
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getMedia(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const filters =
        req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
    const { page, limit, access, group } = filters;

    const { error } = getMediaSchema.validate({ page, limit, access, group });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const result = await mediaService.getPage({
            userId: req.user._id,
            appId: req.appId,
            access,
            page,
            group,
            recordsPerPage: limit,
        });
        return res.status(200).json(result);
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getMediaCount(req: any, res: any) {
    const userId = req.user._id;
    const appId = req.appId;

    try {
        const totalMediaFiles = await getCount({ userId, appId });
        return res.status(200).json({ count: totalMediaFiles });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}

export async function getTotalSpaceOccupied(req: any, res: any) {
    const userId = req.user._id;
    const appId = req.appId;

    try {
        const totalSpaceOccupied = await getTotalSpace({ userId, appId });
        return res.status(200).json({
            storage: totalSpaceOccupied,
            maxStorage: await maxStorageFor(req.user),
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}

export async function getMediaDetails(req: any, res: any) {
    const { mediaId } = req.params;

    try {
        const media = await mediaService.getMediaDetails({
            userId: req.user.id,
            appId: req.appId,
            mediaId,
        });
        if (!media) {
            return res.status(404).json({ error: NOT_FOUND });
        }

        return res.status(200).json(media);
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function deleteMedia(req: any, res: any) {
    const { mediaId } = req.params;

    try {
        await mediaService.deleteMedia({
            userId: req.user.id,
            appId: req.appId,
            mediaId,
        });

        return res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

/* HTTP status for an error from mediaService.sealMedia. Shared by the
   API-key route and the dashboard's session route. */
export function sealErrorStatus(err: { message?: string }): number {
    if (err.message === "Media not found") return 404;
    if (err.message === "Media is already sealed") return 409;
    if (err.message === NOT_ENOUGH_STORAGE) return 403;
    return 500;
}

export async function sealMedia(req: any, res: any) {
    const { mediaId } = req.params;

    try {
        const media = await mediaService.sealMedia({
            userId: req.user.id,
            appId: req.appId,
            mediaId,
        });

        return res.status(200).json(media);
    } catch (err: any) {
        const statusCode = sealErrorStatus(err);
        if (statusCode === 500) {
            logger.error({ err }, err.message);
        }
        return res.status(statusCode).json({ error: err.message });
    }
}
