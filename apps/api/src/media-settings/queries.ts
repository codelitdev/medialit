import { MediaSettings } from "./model";
import { UpdateMediaSettingsProps } from "./service";
import { getMediaSettingsRecord, upsertMediaSettings } from "@/db";
import logger from "../services/log";
import { trackEvent } from "../services/events";

export async function getMediaSettings(
    userId: string,
    appId: string,
): Promise<MediaSettings | null> {
    return getMediaSettingsRecord(userId, appId);
}

export async function updateMediaSettings({
    userId,
    appId,
    useWebP,
    webpOutputQuality,
    thumbnailWidth,
    thumbnailHeight,
}: UpdateMediaSettingsProps): Promise<void> {
    await upsertMediaSettings({
        userId,
        appId,
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight,
    });
    // Undefined fields are left unchanged, so only the given ones changed.
    const given = {
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight,
    };
    const changed = Object.entries(given)
        .filter(([, value]) => value !== undefined)
        .map(([name]) => name);
    logger.info({ app_id: appId, changed }, "media settings updated");
    trackEvent({
        event: "media_settings.updated",
        source: "media_settings.update",
        appId,
        userId,
        properties: {
            changed,
            ...(useWebP !== undefined ? { use_webp: Boolean(useWebP) } : {}),
        },
    });
}
