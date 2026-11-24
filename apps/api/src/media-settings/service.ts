import { getMediaSettingsRecord } from "@/db";
import { MediaSettingsResponse, mediaSettingsSchema } from "./schemas";
import { DEFAULT_WEBP_QUALITY } from "../config/constants";
import { effectiveVideoSettings } from "./video";
import type { UpdateMediaSettingsProps } from "./queries";

export async function getMediaSettings(
    userId: string,
    appId: string,
): Promise<MediaSettingsResponse> {
    const mediaSettings = await getMediaSettingsRecord(userId, appId);
    return {
        useWebP: mediaSettings?.useWebP || false,
        webpOutputQuality:
            mediaSettings?.webpOutputQuality || DEFAULT_WEBP_QUALITY,
        ...effectiveVideoSettings(mediaSettings),
    };
}

type SettingsFields = Omit<UpdateMediaSettingsProps, "userId" | "appId">;

const FIELDS = [
    "useWebP",
    "webpOutputQuality",
    "videoStreaming",
    "hlsRenditions",
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
