import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    maxStorageAllowedNotSubscribed,
    maxStorageAllowedSubscribed,
} from "../../config/constants";
import mediaService from "../../media/service";
import * as mediaQueries from "../../media/queries";
import { getSubscriptionStatus } from "@medialit/models";
import { NOT_FOUND, SUCCESS } from "../../config/strings";
import { AUTH_ERROR, INTERNAL_ERROR } from "./responses";
import {
    mediaListSchema,
    mediaSchema,
    storageSchema,
    successMessageSchema,
} from "./schemas";

export function registerMediaTools(server: McpServer): void {
    server.registerTool(
        "list_media",
        {
            description:
                "Returns a paginated list of media items. Optionally filter by access level (public or private) or group label.",
            inputSchema: {
                page: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("Page number (default: 1)"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("Items per page (default: 10)"),
                access: z
                    .enum(["public", "private"])
                    .optional()
                    .describe("Filter by access level"),
                group: z.string().optional().describe("Filter by group label"),
            },
            outputSchema: mediaListSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
        },
        async (args: any, extra: any) => {
            const userId = extra.authInfo?.user?._id;
            const apikey = extra.authInfo?.token;
            if (!userId || !apikey) {
                return AUTH_ERROR;
            }
            try {
                const currentPage = args.page || 1;
                const recordsPerPage = args.limit || 10;
                const result = await mediaService.getPage({
                    userId,
                    apikey,
                    access: args.access,
                    page: currentPage,
                    group: args.group,
                    recordsPerPage,
                });
                return {
                    content: [
                        { type: "text" as const, text: JSON.stringify(result) },
                    ],
                    structuredContent: { mediaItems: result },
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "get_media",
        {
            description:
                "Returns full metadata for a single media item identified by its ID.",
            inputSchema: {
                mediaId: z.string().describe("Media item ID"),
            },
            outputSchema: mediaSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
        },
        async (args: any, extra: any) => {
            const userId = extra.authInfo?.clientId;
            const apikey = extra.authInfo?.token;
            if (!userId || !apikey) {
                return AUTH_ERROR;
            }
            try {
                const media = await mediaService.getMediaDetails({
                    userId,
                    apikey,
                    mediaId: args.mediaId,
                });
                if (!media) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: NOT_FOUND,
                            },
                        ],
                        isError: true,
                    };
                }
                return {
                    content: [
                        { type: "text" as const, text: JSON.stringify(media) },
                    ],
                    structuredContent: media as any,
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "get_media_count",
        {
            description:
                "Returns the total number of media items in the default app.",
            outputSchema: z.object({ count: z.number() }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
        },
        async (extra: any) => {
            const userId = extra.authInfo?.user?._id;
            const apikey = extra.authInfo?.token;
            if (!userId || !apikey) {
                return AUTH_ERROR;
            }
            try {
                const count = await mediaQueries.getMediaCount({
                    userId,
                    apikey,
                });
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify({ count }),
                        },
                    ],
                    structuredContent: { count },
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "get_total_storage",
        {
            description:
                "Returns the total storage used by the default app and the account storage limit, both in bytes.",
            outputSchema: storageSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
        },
        handleGetTotalStorageTool,
    );

    server.registerTool(
        "delete_media",
        {
            description:
                "Permanently deletes a media item. This action cannot be undone.",
            inputSchema: {
                mediaId: z.string().describe("ID of the media item to delete"),
            },
            outputSchema: successMessageSchema,
            annotations: {
                readOnlyHint: false,
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
                await mediaService.deleteMedia({
                    userId,
                    apikey,
                    mediaId: args.mediaId,
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

    server.registerTool(
        "seal_media",
        {
            description:
                "Locks a media item to mark it for persistence. Once sealed, the item can no longer be modified.",
            inputSchema: {
                mediaId: z.string().describe("ID of the media item to seal"),
            },
            outputSchema: mediaSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
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
                const media = await mediaService.sealMedia({
                    userId,
                    apikey,
                    mediaId: args.mediaId,
                });
                return {
                    content: [
                        { type: "text" as const, text: JSON.stringify(media) },
                    ],
                    structuredContent: media as any,
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}

export async function handleGetTotalStorageTool(
    extra: any,
    dependencies = { getTotalSpace: mediaQueries.getTotalSpace },
) {
    const user = extra.authInfo?.user;
    const userId = user?._id;
    const apikey = extra.authInfo?.token;
    if (!userId || !apikey) {
        return AUTH_ERROR;
    }
    try {
        const storage = await dependencies.getTotalSpace({ userId, apikey });
        const response = {
            storage,
            maxStorage: getSubscriptionStatus(user)
                ? maxStorageAllowedSubscribed
                : maxStorageAllowedNotSubscribed,
        };
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
}
