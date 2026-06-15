import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMediaSettings } from "../../media-settings/service";
import { updateMediaSettings } from "../../media-settings/queries";

const AUTH_ERROR = {
    content: [
        {
            type: "text" as const,
            text: "Authentication required: valid API credentials were not provided.",
        },
    ],
    isError: true,
};

const INTERNAL_ERROR = {
    content: [
        {
            type: "text" as const,
            text: "An error occurred while processing your request.",
        },
    ],
    isError: true,
};

export function registerSettingsTools(server: McpServer): void {
    // get_media_settings
    server.registerTool(
        "get_media_settings",
        {
            description:
                "Returns the current image processing configuration for the account, including WebP conversion settings and thumbnail dimensions.",
            outputSchema: z.object({}).passthrough(),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
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
                    .optional()
                    .describe("Generated thumbnail width in pixels"),
                thumbnailHeight: z
                    .number()
                    .int()
                    .optional()
                    .describe("Generated thumbnail height in pixels"),
            },
            outputSchema: z.object({}).passthrough(),
            annotations: {
                destructiveHint: true,
                openWorldHint: true,
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
                return {
                    content: [
                        { type: "text" as const, text: "Settings updated" },
                    ],
                    structuredContent: { updated: true },
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
