import { MediaSettings } from "./model";
import { UpdateMediaSettingsProps } from "./service";
import { getMediaSettingsRecord, upsertMediaSettings } from "@/db";

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
}
