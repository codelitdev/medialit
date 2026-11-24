import { MediaSettings } from "./model";
import { UpdateMediaSettingsProps } from "./service";
import { getMediaSettingsRecord, upsertMediaSettings } from "@/db";
import logger from "../services/log";
import { trackEvent } from "../services/events";
import { normalizeRenditions } from "./video";

export async function getMediaSettings(
    userId: string,
    appId: string,
): Promise<MediaSettings | null> {
    return getMediaSettingsRecord(userId, appId);
}

/**
 * The one write path for media settings (REST, MCP, CLI and the dashboard).
 * Undefined fields are left unchanged; `null` sets the HLS renditions back
 * to the default ladder. Renditions are checked, deduplicated and sorted here, so
 * every client stores the same thing. Throws `VideoSettingsError` for
 * renditions outside the fixed list.
 */
export async function updateMediaSettings({
    userId,
    appId,
    useWebP,
    webpOutputQuality,
    videoStreaming,
    hlsRenditions,
}: UpdateMediaSettingsProps): Promise<void> {
    const renditions =
        hlsRenditions === undefined || hlsRenditions === null
            ? hlsRenditions
            : normalizeRenditions(hlsRenditions);
    await upsertMediaSettings({
        userId,
        appId,
        useWebP,
        webpOutputQuality,
        videoStreaming,
        hlsRenditions: renditions,
    });
    const given = {
        useWebP,
        webpOutputQuality,
        videoStreaming,
        hlsRenditions,
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
            ...(videoStreaming !== undefined
                ? { video_streaming: videoStreaming }
                : {}),
            ...(renditions !== undefined
                ? { hls_renditions: renditions ?? "default" }
                : {}),
        },
    });
}
