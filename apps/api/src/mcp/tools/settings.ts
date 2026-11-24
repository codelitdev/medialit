import { z } from "zod";
import { getMediaSettings } from "../../media-settings/service";
import { updateMediaSettings } from "../../media-settings/queries";
import { SUCCESS } from "../../config/strings";
import type { MedialitMcpTool } from "../context";
import { medialitTool } from "../tool";
import { mediaSettingsSchema, successMessageSchema } from "./schemas";
import { HLS_RENDITIONS } from "../../media-settings/video";

export const settingsTools = (): MedialitMcpTool[] => [
    medialitTool({
        name: "get_media_settings",
        title: "Get media settings",
        risk: "read",
        description:
            "Returns the current media processing configuration for the connected app: WebP conversion and quality, and video streaming (videoStreaming is off, hls or mp4; apps start off; hlsRenditions lists the HLS sizes made).",
        inputSchema: z.object({}),
        outputSchema: mediaSettingsSchema,
        annotations: { idempotentHint: true },
        handler: ({ context }) =>
            getMediaSettings(context.userId, context.appId),
    }),

    medialitTool({
        name: "update_media_settings",
        title: "Update media settings",
        // Settings can be set back, and only affect files uploaded later.
        risk: "write",
        description:
            "Changes media processing settings for the connected app. Supply only the fields you want to change; omitted fields retain their current values. Settings apply to files sealed afterwards.",
        inputSchema: z.object({
            useWebP: z
                .boolean()
                .optional()
                .describe("Convert uploaded images to WebP format"),
            webpOutputQuality: z
                .number()
                .int()
                .min(1)
                .max(100)
                .optional()
                .describe("WebP output quality 1–100. Defaults to 80"),
            videoStreaming: z
                .enum(["off", "hls", "mp4"])
                .optional()
                .describe(
                    "How sealed videos are prepared for playback: hls (adaptive streaming), mp4 (one file optimized for the web) or off. Apps start off",
                ),
            hlsRenditions: z
                .array(z.enum(HLS_RENDITIONS))
                .min(1)
                .nullable()
                .optional()
                .describe(
                    'HLS sizes to make, e.g. ["1080p", "720p", "480p"]. Sizes larger than the video are skipped. null goes back to the default',
                ),
        }),
        outputSchema: successMessageSchema,
        annotations: { idempotentHint: true },
        async handler({ context, args }) {
            // The upsert leaves a field it is given as undefined unchanged.
            await updateMediaSettings({
                userId: context.userId,
                appId: context.appId,
                ...args,
            });
            return { message: SUCCESS };
        },
    }),
];
