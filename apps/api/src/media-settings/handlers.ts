import Joi from "joi";
import { SUCCESS } from "../config/strings";
import logger from "../services/log";
import { updateMediaSettings } from "./queries";
import * as mediaSettingsService from "./service";

export async function updateMediaSettingsHandler(
    req: any,
    res: any,
    next: (...args: any[]) => void
) {
    const mediaSettingsSchema = Joi.object({
        useWebP: Joi.boolean(),
        webpOutputQuality: Joi.number().min(0).max(100),
        thumbnailWidth: Joi.number().positive(),
        thumbnailHeight: Joi.number().positive(),
    });

    const { useWebP, webpOutputQuality, thumbnailWidth, thumbnailHeight } =
        req.body;

    const { error, value } = mediaSettingsSchema.validate({
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight,
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        await updateMediaSettings({
            userId: req.user.id,
            apikey: req.apikey,
            useWebP,
            webpOutputQuality,
            thumbnailWidth,
            thumbnailHeight,
        });
        return res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getMediaSettingsHandler(req: any, res: any) {
    try {
        const mediaSettings = await mediaSettingsService.getMediaSettings(
            req.user.id,
            req.apikey
        );
        return res.status(200).json(mediaSettings);
    } catch (err: any) {
        logger.error({ err }, err.message);
        return res.status(500).json({ error: err.message });
    }
}
