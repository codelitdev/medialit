import * as queries from "./queries";
import { MediaSettingsResponse } from "./schemas";
import {
    thumbnailHeight as defaultThumbnailHeight,
    thumbnailWidth as defaultThumbnailWidth,
} from "../config/constants";
import { resolveAccountPlan } from "../billing/entitlements";
import {
    effectiveVideoSettings,
    type VideoSettings,
    type VideoStreaming,
} from "./video";

export async function getMediaSettings(
    userId: string,
    appId: string,
): Promise<MediaSettingsResponse> {
    const [mediaSettings, plan] = await Promise.all([
        queries.getMediaSettings(userId, appId),
        resolveAccountPlan({ id: userId }),
    ]);
    const video = effectiveVideoSettings(mediaSettings, plan);

    if (!mediaSettings) {
        return {
            useWebP: false,
            webpOutputQuality: 0,
            thumbnailHeight: defaultThumbnailHeight,
            thumbnailWidth: defaultThumbnailWidth,
            ...video,
        };
    }

    return {
        useWebP: mediaSettings.useWebP || false,
        webpOutputQuality: mediaSettings.webpOutputQuality || 0,
        thumbnailHeight:
            mediaSettings.thumbnailHeight || defaultThumbnailHeight,
        thumbnailWidth: mediaSettings.thumbnailWidth || defaultThumbnailWidth,
        ...video,
    };
}

/** The video settings in effect for an app now. Seal copies them into the
 * jobs it queues (phase 0, D9). */
export async function getVideoSettings(
    userId: string,
    appId: string,
): Promise<VideoSettings> {
    const [mediaSettings, plan] = await Promise.all([
        queries.getMediaSettings(userId, appId),
        resolveAccountPlan({ id: userId }),
    ]);
    return effectiveVideoSettings(mediaSettings, plan);
}

/** Fields left undefined keep their value. `null` sets a video setting back
 * to its default. */
export interface UpdateMediaSettingsProps {
    userId: string;
    appId: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    videoStreaming?: VideoStreaming | null;
    hlsRenditions?: string[] | null;
}

export async function updateMediaSettings(
    props: UpdateMediaSettingsProps,
): Promise<void> {
    await queries.updateMediaSettings(props);
}
