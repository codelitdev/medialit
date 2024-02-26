import { MediaSettings } from "./model";
import * as queries from "./queries";

export async function getMediaSettings(
    userId: string,
    apikey: string
): Promise<Omit<MediaSettings, "userId" | "apikey"> | null> {
    const mediaSettings = await queries.getMediaSettings(userId, apikey);

    if (!mediaSettings) {
        return {};
    }

    return {
        useWebP: mediaSettings.useWebP,
        webpOutputQuality: mediaSettings.webpOutputQuality,
        thumbnailHeight: mediaSettings.thumbnailHeight,
        thumbnailWidth: mediaSettings.thumbnailWidth,
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
