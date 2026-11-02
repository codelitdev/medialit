import Joi from "joi";
import {
    FILE_IS_REQUIRED,
    NOT_ENOUGH_STORAGE,
    NOT_FOUND,
    SUCCESS,
} from "../config/strings";
import logger from "../services/log";
import { Request } from "express";
import mediaService from "./service";
import { getMediaCount as getCount, getTotalSpace } from "./queries";
import { maxStorageFor } from "../billing/entitlements";
import { getSignatureFromReq } from "../signature/utils";
import {
    assetLookupSchema,
    getMediaSchema,
    timelineQuerySchema,
    uploadMediaSchema,
} from "./schemas";
import { AssetExistsError } from "./errors";
import { InvalidCursorError } from "./service";
import { removeTempFile } from "./storage-middleware";

function validateUploadOptions(req: Request): Joi.ValidationResult {
    const { caption, access, group, assetId, takenAt } = req.body;
    return uploadMediaSchema.validate({
        caption,
        access,
        group,
        assetId,
        takenAt,
    });
}

export async function uploadMedia(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    req.socket.setTimeout(10 * 60 * 1000); // 10 minutes

    if (!req.files || !req.files.file) {
        return res.status(400).json({ error: FILE_IS_REQUIRED });
    }

    const { error, value: options } = validateUploadOptions(req);
    if (error) {
        await removeTempFile(req.files.file.tempFilePath);
        return res.status(400).json({ error: error.message });
    }

    const { file } = req.files;
    const { access, caption } = req.body;
    const { assetId, takenAt } = options;
    // A signature's group wins over the form's.
    const group = req.group ?? req.body.group;
    const userId = req.user.id;
    const appId = req.appId;

    try {
        if (assetId) {
            // Say so before the file is stored, not after.
            const [existing] = await mediaService.findAssets({
                userId,
                appId,
                assetIds: [assetId],
            });
            if (existing) {
                await removeTempFile(file.tempFilePath);
                return res
                    .status(409)
                    .json(
                        new AssetExistsError(
                            existing.mediaId,
                            existing.sealed,
                        ).toBody(),
                    );
            }
        }

        const mediaId = await mediaService.upload({
            userId,
            appId,
            file,
            access,
            caption,
            group,
            signature: getSignatureFromReq(req),
            assetId,
            takenAt,
        });

        const media = await mediaService.getMediaDetails({
            userId: req.user.id,
            appId,
            mediaId,
        });

        return res.status(200).json(media);
    } catch (err: any) {
        if (err instanceof AssetExistsError) {
            return res.status(409).json(err.toBody());
        }
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getMediaAssets(req: any, res: any) {
    const { error, value } = assetLookupSchema.validate(req.body ?? {});
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const found = await mediaService.findAssets({
            userId: req.user.id,
            appId: req.appId,
            assetIds: value.assetIds,
        });
        return res.status(200).json(found);
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getMediaTimeline(req: any, res: any) {
    const { error, value } = timelineQuerySchema.validate(req.query);
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const page = await mediaService.getTimeline({
            userId: req.user.id,
            appId: req.appId,
            limit: value.limit,
            cursor: value.cursor,
            kind: value.kind,
            access: value.access,
            group: value.group,
        });
        return res.status(200).json(page);
    } catch (err: any) {
        if (err instanceof InvalidCursorError) {
            return res.status(400).json({ error: err.message });
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
