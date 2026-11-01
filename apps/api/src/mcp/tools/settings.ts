import { z } from "zod";
import { getMediaSettings } from "../../media-settings/service";
import { updateMediaSettings } from "../../media-settings/queries";
import { SUCCESS } from "../../config/strings";
import type { MedialitMcpTool } from "../context";
import { medialitTool } from "../tool";
import { mediaSettingsSchema, successMessageSchema } from "./schemas";

export const settingsTools = (): MedialitMcpTool[] => [
    medialitTool({
        name: "get_media_settings",
        title: "Get media settings",
        risk: "read",
        description:
            "Returns the current image processing configuration for the connected app, including WebP conversion settings and thumbnail dimensions.",
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
            "Overwrites image processing settings for the connected app. Supply only the fields you want to change; omitted fields retain their current values.",
        inputSchema: z.object({
            useWebP: z
                .boolean()
                .optional()
                .describe("Convert uploaded images to WebP format"),
            webpOutputQuality: z
                .number()
                .int()
                .min(0)
                .max(100)
                .optional()
                .describe("WebP output quality 0–100"),
            thumbnailWidth: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Generated thumbnail width in pixels"),
            thumbnailHeight: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Generated thumbnail height in pixels"),
        }),
        outputSchema: successMessageSchema,
        annotations: { idempotentHint: true },
        async handler({ context, args }) {
            // The upsert leaves a field it is given as undefined unchanged.
            await updateMediaSettings({
                userId: context.userId,
                appId: context.appId,
                useWebP: args.useWebP as boolean,
                webpOutputQuality: args.webpOutputQuality as number,
                thumbnailWidth: args.thumbnailWidth as number,
                thumbnailHeight: args.thumbnailHeight as number,
            });
            return { message: SUCCESS };
        },
    }),
];
