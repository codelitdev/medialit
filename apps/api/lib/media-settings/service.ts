import { MediaSettings } from "./model";
import * as queries from "./queries";

export async function getMediaSettings(
    userId: string
): Promise<Omit<MediaSettings, "userId"> | null> {
    const mediaSettings = await queries.getMediaSettings(userId);

    if (!mediaSettings) {
        return null;
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
    useWebP: boolean;
    webpOutputQuality: number;
    thumbnailWidth: number;
    thumbnailHeight: number;
}

export async function updateMediaSettings({
    userId,
    useWebP,
    webpOutputQuality,
    thumbnailWidth,
    thumbnailHeight,
}: UpdateMediaSettingsProps): Promise<void> {
    await queries.updateMediaSettings({
        userId,
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight,
    });
}
