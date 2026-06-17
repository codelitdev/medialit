import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMediaSettings } from "../../media-settings/service";
import { updateMediaSettings } from "../../media-settings/queries";
import { SUCCESS } from "../../config/strings";
import { AUTH_ERROR, INTERNAL_ERROR } from "./responses";
import { mediaSettingsSchema, successMessageSchema } from "./schemas";

export function registerSettingsTools(server: McpServer): void {
    // get_media_settings
    server.registerTool(
        "get_media_settings",
        {
            description:
                "Returns the current image processing configuration for the account, including WebP conversion settings and thumbnail dimensions.",
            outputSchema: mediaSettingsSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
        },
        async (extra: any) => {
            const userId = extra.authInfo?.clientId;
            const apikey = extra.authInfo?.token;
            if (!userId || !apikey) {
                return AUTH_ERROR;
            }
            try {
                const settings = await getMediaSettings(userId, apikey);
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(settings),
                        },
                    ],
                    structuredContent: (settings as any) ?? {},
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    // update_media_settings
    server.registerTool(
        "update_media_settings",
        {
            description:
                "Overwrites image processing settings for the account. Supply only the fields you want to change; omitted fields retain their current values.",
            inputSchema: {
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
            },
            outputSchema: successMessageSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                openWorldHint: false,
            },
        },
        async (args: any, extra: any) => {
            const userId = extra.authInfo?.clientId;
            const apikey = extra.authInfo?.token;
            if (!userId || !apikey) {
                return AUTH_ERROR;
            }
            try {
                await updateMediaSettings({
                    userId,
                    apikey,
                    useWebP: args.useWebP,
                    webpOutputQuality: args.webpOutputQuality,
                    thumbnailWidth: args.thumbnailWidth,
                    thumbnailHeight: args.thumbnailHeight,
                });
                const response = { message: SUCCESS };
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(response),
                        },
                    ],
                    structuredContent: response,
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
