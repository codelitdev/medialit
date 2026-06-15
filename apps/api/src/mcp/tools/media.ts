import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import mediaService from "../../media/service";
import { getMediaCount, getTotalSpace } from "../../media/queries";

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

export function registerMediaTools(server: McpServer): void {
    // list_media
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
            outputSchema: z
                .object({
                    mediaItems: z.array(z.any()),
                    total: z.number(),
                    page: z.number(),
                })
                .passthrough(),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
            },
        },
        async (args: any, extra: any) => {
            const userId = extra.authInfo?.clientId;
            const apikey = extra.authInfo?.token;
            if (!userId || !apikey) {
                return AUTH_ERROR;
            }
            try {
                const currentPage = args.page || 1;
                const recordsPerPage = args.limit || 10;
                // Run the page query and the filtered count in parallel so the
                // MCP response returns the real total (matching access/group
                // filters) without a sequential round-trip penalty.
                const [result, total] = await Promise.all([
                    mediaService.getPage({
                        userId,
                        apikey,
                        access: args.access,
                        page: currentPage,
                        group: args.group,
                        recordsPerPage,
                    }),
                    mediaService.getMediaCount({
                        userId,
                        apikey,
                        access: args.access,
                        group: args.group,
                        page: currentPage,
                        recordsPerPage,
                    }),
                ]);
                return {
                    content: [
                        { type: "text" as const, text: JSON.stringify(result) },
                    ],
                    structuredContent: {
                        mediaItems: result,
                        total,
                        page: currentPage,
                    },
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    // get_media
    server.registerTool(
        "get_media",
        {
            description:
                "Returns full metadata for a single media item identified by its ID.",
            inputSchema: {
                mediaId: z.string().describe("Media item ID"),
            },
            outputSchema: z.object({ mediaId: z.string() }).passthrough(),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
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
                                text: "Media item not found.",
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

    // get_media_count
    server.registerTool(
        "get_media_count",
        {
            description:
                "Returns the total number of media items in the authenticated account.",
            outputSchema: z.object({ count: z.number() }),
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
                const count = await getMediaCount({ userId, apikey });
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

    // get_media_size
    server.registerTool(
        "get_media_size",
        {
            description:
                "Returns the total storage used and the account storage limit, both in bytes.",
            outputSchema: z.object({ storage: z.any() }).passthrough(),
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
                const storage = await getTotalSpace({ userId, apikey });
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify({ storage }),
                        },
                    ],
                    structuredContent: { storage } as Record<string, unknown>,
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    // delete_media
    server.registerTool(
        "delete_media",
        {
            description:
                "Permanently deletes a media item and all its associated files. This action cannot be undone.",
            inputSchema: {
                mediaId: z.string().describe("ID of the media item to delete"),
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
                await mediaService.deleteMedia({
                    userId,
                    apikey,
                    mediaId: args.mediaId,
                });
                return {
                    content: [
                        { type: "text" as const, text: "Deleted successfully" },
                    ],
                    structuredContent: { deleted: true, mediaId: args.mediaId },
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    // seal_media
    server.registerTool(
        "seal_media",
        {
            description:
                "Locks a media item to mark it as finalized. Once sealed, the item can no longer be modified.",
            inputSchema: {
                mediaId: z.string().describe("ID of the media item to seal"),
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
                const media = await mediaService.sealMedia({
                    userId,
                    apikey,
                    mediaId: args.mediaId,
                });
                return {
                    content: [
                        { type: "text" as const, text: JSON.stringify(media) },
                    ],
                    structuredContent: (media as any) ?? {
                        sealed: true,
                        mediaId: args.mediaId,
                    },
                };
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
