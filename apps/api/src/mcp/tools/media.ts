import { z } from "zod";
import mediaService from "../../media/service";
import mediaQueries from "../../media/queries";
import { maxStorageFor } from "../../billing/entitlements";
import { NOT_ENOUGH_STORAGE, SUCCESS } from "../../config/strings";
import type { MedialitMcpTool } from "../context";
import { medialitTool } from "../tool";
import { notFound, toolError } from "./errors";
import {
    mediaListSchema,
    mediaSchema,
    storageSchema,
    successMessageSchema,
} from "./schemas";

export const mediaTools = (): MedialitMcpTool[] => [
    medialitTool({
        name: "list_media",
        title: "List media",
        risk: "read",
        description:
            "Returns a paginated list of media items. Optionally filter by access level (public or private) or group label.",
        inputSchema: z.object({
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
        }),
        outputSchema: mediaListSchema,
        annotations: { idempotentHint: true },
        async handler({ context, args }) {
            const mediaItems = await mediaService.getPage({
                userId: context.userId,
                appId: context.appId,
                access: args.access,
                page: args.page || 1,
                group: args.group,
                recordsPerPage: args.limit || 10,
            });
            return { mediaItems };
        },
    }),

    medialitTool({
        name: "get_media",
        title: "Get media",
        risk: "read",
        description:
            "Returns full metadata for a single media item identified by its ID.",
        inputSchema: z.object({
            mediaId: z.string().describe("Media item ID"),
        }),
        outputSchema: mediaSchema,
        annotations: { idempotentHint: true },
        async handler({ context, args }) {
            const media = await mediaService.getMediaDetails({
                userId: context.userId,
                appId: context.appId,
                mediaId: args.mediaId,
            });
            return media ?? notFound();
        },
    }),

    medialitTool({
        name: "get_media_count",
        title: "Get media count",
        risk: "read",
        description:
            "Returns the total number of media items in the connected app.",
        inputSchema: z.object({}),
        outputSchema: z.object({ count: z.number() }),
        annotations: { idempotentHint: true },
        async handler({ context }) {
            const count = await mediaQueries.getMediaCount({
                userId: context.userId,
                appId: context.appId,
            });
            return { count };
        },
    }),

    medialitTool({
        name: "get_total_storage",
        title: "Get total storage",
        risk: "read",
        description:
            "Returns the total storage used by the connected app and the account storage limit, both in bytes.",
        inputSchema: z.object({}),
        outputSchema: storageSchema,
        annotations: { idempotentHint: true },
        async handler({ context }) {
            const storage = await mediaQueries.getTotalSpace({
                userId: context.userId,
                appId: context.appId,
            });
            return { storage, maxStorage: await maxStorageFor(context.user) };
        },
    }),

    medialitTool({
        name: "delete_media",
        title: "Delete media",
        risk: "destructive",
        description:
            "Permanently deletes a media item. This action cannot be undone.",
        inputSchema: z.object({
            mediaId: z.string().describe("ID of the media item to delete"),
        }),
        outputSchema: successMessageSchema,
        annotations: { openWorldHint: true },
        async handler({ context, args }) {
            await mediaService.deleteMedia({
                userId: context.userId,
                appId: context.appId,
                mediaId: args.mediaId,
            });
            return { message: SUCCESS };
        },
    }),

    medialitTool({
        name: "seal_media",
        title: "Seal media",
        // Sealing can't be undone, and a public upload becomes public.
        risk: "destructive",
        description:
            "Finalizes a temporary upload for retention, preventing automatic cleanup. Public uploads become publicly accessible. Already sealed items are returned unchanged.",
        inputSchema: z.object({
            mediaId: z.string().describe("ID of the media item to seal"),
        }),
        outputSchema: mediaSchema,
        annotations: { openWorldHint: true },
        async handler({ context, args }) {
            try {
                return await mediaService.sealMedia({
                    userId: context.userId,
                    appId: context.appId,
                    mediaId: args.mediaId,
                });
            } catch (error) {
                const message = (error as Error | undefined)?.message;
                if (message === "Media not found") return notFound();
                if (message === NOT_ENOUGH_STORAGE) {
                    return toolError("forbidden", {
                        reason: "not_enough_storage",
                        message: NOT_ENOUGH_STORAGE,
                    });
                }
                throw error;
            }
        },
    }),
];
