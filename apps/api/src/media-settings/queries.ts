import type { MediaSettingsRow } from "@medialit/db";
import getRepositories from "../config/repositories";
import { UpdateMediaSettingsProps } from "./service";

export type MediaSettings = MediaSettingsRow;

export async function getMediaSettings(
    userId: string,
    apikey: string,
): Promise<MediaSettings | null> {
    return await getRepositories().mediaSettings.findOne(userId, apikey);
}

export async function updateMediaSettings({
    userId,
    apikey,
    useWebP,
    webpOutputQuality,
    thumbnailWidth,
    thumbnailHeight,
}: UpdateMediaSettingsProps): Promise<void> {
    await getRepositories().mediaSettings.upsert({
        userId,
        apikey,
        useWebP,
        webpOutputQuality,
        thumbnailWidth,
        thumbnailHeight,
    });
}
