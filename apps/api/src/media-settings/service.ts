import * as queries from "./queries";
import { MediaSettingsResponse } from "./schemas";
import {
    thumbnailHeight as defaultThumbnailHeight,
    thumbnailWidth as defaultThumbnailWidth,
} from "../config/constants";

export async function getMediaSettings(
    userId: string,
    apikey: string,
): Promise<MediaSettingsResponse> {
    const mediaSettings = await queries.getMediaSettings(userId, apikey);

    if (!mediaSettings) {
        return {
            useWebP: false,
            webpOutputQuality: 0,
            thumbnailHeight: defaultThumbnailHeight,
            thumbnailWidth: defaultThumbnailWidth,
        };
    }

    return {
        useWebP: mediaSettings.useWebP || false,
        webpOutputQuality: mediaSettings.webpOutputQuality || 0,
        thumbnailHeight:
            mediaSettings.thumbnailHeight || defaultThumbnailHeight,
        thumbnailWidth: mediaSettings.thumbnailWidth || defaultThumbnailWidth,
    };
}

export interface UpdateMediaSettingsProps {
    userId: string;
    apikey: string;
    useWebP: boolean;
    webpOutputQuality: number;
    thumbnailWidth: number;
    thumbnailHeight: number;
}

export async function updateMediaSettings({
    userId,
    apikey,
    useWebP,
    webpOutputQuality,
    thumbnailWidth,
    thumbnailHeight,
}: UpdateMediaSettingsProps): Promise<void> {
    await queries.updateMediaSettings({
        userId,
        apikey,
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight,
    });
}
