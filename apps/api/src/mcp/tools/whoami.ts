import { z } from "zod";
import { getAppById } from "@/db";
import { maxStorageFor } from "../../billing/entitlements";
import mediaQueries from "../../media/queries";
import type { MedialitMcpTool } from "../context";
import { medialitTool } from "../tool";
import { toolError } from "./errors";
import { whoamiSchema } from "./schemas";

export const whoamiTools = (): MedialitMcpTool[] => [
    medialitTool({
        name: "whoami",
        title: "Who am I",
        risk: "read",
        description:
            "Returns the signed-in account, the app this connection manages files in, and that app's file count and storage use against the account limit (bytes).",
        inputSchema: z.object({}),
        outputSchema: whoamiSchema,
        annotations: { idempotentHint: true },
        async handler({ context }) {
            const { authKind, user, userId, appId } = context;
            const [app, files, storage] = await Promise.all([
                getAppById(appId),
                mediaQueries.getMediaCount({ userId, appId }),
                mediaQueries.getTotalSpace({ userId, appId }),
            ]);
            if (!app || app.deleted) {
                return toolError("tenant_forbidden", {
                    reason: "app_not_found",
                });
            }
            // Identify the app by its public ID; never an internal ID or a key.
            return {
                auth: authKind,
                email: user.email,
                app: {
                    id: app.appId,
                    name: app.name,
                    default: Boolean(app.default),
                },
                files,
                storage,
                maxStorage: await maxStorageFor(user),
            };
        },
    }),
];
