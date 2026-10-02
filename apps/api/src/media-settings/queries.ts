import { MediaSettings } from "./model";
import { UpdateMediaSettingsProps } from "./service";
import { getMediaSettingsRecord, upsertMediaSettings } from "@/db";

export async function getMediaSettings(
    userId: string,
    apikey: string,
): Promise<MediaSettings | null> {
    return getMediaSettingsRecord(userId, apikey);
}

export async function updateMediaSettings({
    userId,
    apikey,
    useWebP,
    webpOutputQuality,
    thumbnailWidth,
    thumbnailHeight,
}: UpdateMediaSettingsProps): Promise<void> {
    await upsertMediaSettings({
        userId,
        apikey,
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight,
    });
}
