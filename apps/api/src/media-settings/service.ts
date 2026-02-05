import * as queries from "./queries";
import { MediaSettingsResponse } from "./schemas";

export async function getMediaSettings(
    userId: string,
    apikey: string,
): Promise<MediaSettingsResponse | null> {
    const mediaSettings = await queries.getMediaSettings(userId, apikey);

    if (!mediaSettings) {
        return null; // Return null if not found to match the type
    }

    return {
        useWebP: mediaSettings.useWebP || false,
        webpOutputQuality: mediaSettings.webpOutputQuality || 0,
        thumbnailHeight: mediaSettings.thumbnailHeight || 0,
        thumbnailWidth: mediaSettings.thumbnailWidth || 0,
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
