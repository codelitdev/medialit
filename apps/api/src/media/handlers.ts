import Joi from "joi";
import {
    maxFileUploadSizeNotSubscribed,
    maxFileUploadSizeSubscribed,
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
import { Constants } from "@medialit/models";

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
    const isSubscribed =
        req.user.subscriptionStatus === Constants.SubscriptionStatus.SUBSCRIBED;
    return isSubscribed
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

        return res.status(200).json(media);
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
        const totalMediaFiles = await getTotalSpace({ userId, apikey });
        return res.status(200).json({ count: totalMediaFiles });
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
