import { SUCCESS } from "../config/strings";
import logger from "../services/log";
import { updateMediaSettings } from "./queries";
import * as mediaSettingsService from "./service";
import { VideoSettingsError } from "./video";

import { mediaSettingsSchema } from "./schemas";

/** The fields an update may carry. A field missing from the body stays
 * undefined, so it is left unchanged; `null` is kept, so the renditions reset. */
const FIELDS = [
    "useWebP",
    "webpOutputQuality",
    "videoStreaming",
    "hlsRenditions",
] as const;

export async function updateMediaSettingsHandler(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    const body = req.body ?? {};
    const input = Object.fromEntries(
        FIELDS.filter((field) => body[field] !== undefined).map((field) => [
            field,
            body[field],
        ]),
    );

    const { error } = mediaSettingsSchema.validate(input);

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        await updateMediaSettings({
            userId: req.user.id,
            appId: req.appId,
            ...input,
        });
        return res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        if (err instanceof VideoSettingsError) {
            return res.status(400).json({ error: err.message });
        }
        logger.error({ err, app_id: req.appId }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getMediaSettingsHandler(req: any, res: any) {
    try {
        const mediaSettings = await mediaSettingsService.getMediaSettings(
            req.user.id,
            req.appId,
        );
        return res.status(200).json(mediaSettings);
    } catch (err: any) {
        logger.error({ err, app_id: req.appId }, err.message);
        return res.status(500).json({ error: err.message });
    }
}
