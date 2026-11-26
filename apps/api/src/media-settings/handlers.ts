import { SUCCESS } from "../config/strings";
import logger from "../services/log";
import { updateMediaSettings } from "./queries";
import { getMediaSettings, parseMediaSettingsUpdate } from "./service";

export async function updateMediaSettingsHandler(req: any, res: any) {
    const parsed = parseMediaSettingsUpdate(req.body);
    if ("error" in parsed) {
        return res.status(400).json({ error: parsed.error });
    }

    try {
        await updateMediaSettings({
            userId: req.user.id,
            appId: req.appId,
            ...parsed.update,
        });
        return res.status(200).json({ message: SUCCESS });
    } catch (err: any) {
        logger.error({ err, app_id: req.appId }, err.message);
        return res.status(500).json({ error: err.message });
    }
}

export async function getMediaSettingsHandler(req: any, res: any) {
    try {
        const mediaSettings = await getMediaSettings(req.user.id, req.appId);
        return res.status(200).json(mediaSettings);
    } catch (err: any) {
        logger.error({ err, app_id: req.appId }, err.message);
        return res.status(500).json({ error: err.message });
    }
}
