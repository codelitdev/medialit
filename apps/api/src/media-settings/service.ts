import * as queries from "./queries";
import { MediaSettingsResponse } from "./schemas";
import { DEFAULT_WEBP_QUALITY } from "../config/constants";
import {
    effectiveVideoSettings,
    type VideoSettings,
    type VideoStreaming,
} from "./video";

export async function getMediaSettings(
    userId: string,
    appId: string,
): Promise<MediaSettingsResponse> {
    const mediaSettings = await queries.getMediaSettings(userId, appId);
    const video = effectiveVideoSettings(mediaSettings);

    if (!mediaSettings) {
        return {
            useWebP: false,
            webpOutputQuality: DEFAULT_WEBP_QUALITY,
            ...video,
        };
    }

    return {
        useWebP: mediaSettings.useWebP || false,
        webpOutputQuality:
            mediaSettings.webpOutputQuality || DEFAULT_WEBP_QUALITY,
        ...video,
    };
}

/** The video settings in effect for an app now. Seal copies them into the
 * jobs it queues (phase 0, D9). */
export async function getVideoSettings(
    userId: string,
    appId: string,
): Promise<VideoSettings> {
    return effectiveVideoSettings(
        await queries.getMediaSettings(userId, appId),
    );
}

/** Fields left undefined keep their value. `null` sets the HLS renditions
 * back to the default ladder. */
export interface UpdateMediaSettingsProps {
    userId: string;
    appId: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    videoStreaming?: VideoStreaming;
    hlsRenditions?: string[] | null;
}

export async function updateMediaSettings(
    props: UpdateMediaSettingsProps,
): Promise<void> {
    await queries.updateMediaSettings(props);
}
