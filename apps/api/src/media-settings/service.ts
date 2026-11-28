import { getDb, getMediaSettingsRecord } from "@/db";
import { hasLiveWorker } from "../jobs/runner";
import { MediaSettingsResponse, mediaSettingsSchema } from "./schemas";
import { DEFAULT_WEBP_QUALITY } from "../config/constants";
import { effectiveVideoSettings } from "./video";
import type { UpdateMediaSettingsProps } from "./queries";

export async function getMediaSettings(
    userId: string,
    appId: string,
): Promise<MediaSettingsResponse> {
    const [mediaSettings, captionsAvailable] = await Promise.all([
        getMediaSettingsRecord(userId, appId),
        hasLiveWorker(getDb(), "transcribe"),
    ]);
    return {
        useWebP: mediaSettings?.useWebP || false,
        webpOutputQuality:
            mediaSettings?.webpOutputQuality || DEFAULT_WEBP_QUALITY,
        ...effectiveVideoSettings(mediaSettings),
        generateCaptions: mediaSettings?.generateCaptions ?? false,
        captionsAvailable,
    };
}

type SettingsFields = Omit<UpdateMediaSettingsProps, "userId" | "appId">;

const FIELDS = [
    "useWebP",
    "webpOutputQuality",
    "videoStreaming",
    "hlsRenditions",
    "generateCaptions",
] as const;

/** Picks the settings fields from a request body and validates them. A field
 * missing from the body stays undefined, so it is left unchanged; `null` is
 * kept, so the renditions reset. */
export function parseMediaSettingsUpdate(
    body: Record<string, unknown> | undefined,
): { update: SettingsFields } | { error: string } {
    const input = Object.fromEntries(
        FIELDS.filter((field) => body?.[field] !== undefined).map((field) => [
            field,
            body![field],
        ]),
    );
    const { error } = mediaSettingsSchema.validate(input);
    return error ? { error: error.message } : { update: input };
}
