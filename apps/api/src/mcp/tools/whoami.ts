import { getApiKeyUsingKeyId } from "../../apikey/queries";
import { maxStorageFor } from "../../billing/entitlements";
import * as mediaQueries from "../../media/queries";
import { getMcpAuth } from "../auth-context";
import type { McpToolRegistrar } from "../server";
import { AUTH_ERROR, INTERNAL_ERROR } from "./responses";
import { whoamiSchema } from "./schemas";

export function registerWhoamiTool(server: McpToolRegistrar): void {
    server.registerTool(
        "whoami",
        {
            description:
                "Returns the signed-in account, the app this connection manages files in, and that app's file count and storage use against the account limit (bytes).",
            outputSchema: whoamiSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
                destructiveHint: false,
            },
        },
        handleWhoamiTool,
    );
}

export async function handleWhoamiTool(
    _args: unknown,
    extra: any,
    dependencies = {
        getApiKey: getApiKeyUsingKeyId,
        getMediaCount: mediaQueries.getMediaCount,
        getTotalSpace: mediaQueries.getTotalSpace,
    },
) {
    const auth = getMcpAuth(extra);
    if (!auth) return AUTH_ERROR;
    const { authKind, user, userId, apikey } = auth;
    try {
        const [app, files, storage] = await Promise.all([
            dependencies.getApiKey(apikey),
            dependencies.getMediaCount({ userId, apikey }),
            dependencies.getTotalSpace({ userId, apikey }),
        ]);
        if (!app) return AUTH_ERROR;
        // Identify the app by its public id; never return the key itself.
        const response = {
            auth: authKind,
            email: user.email,
            app: {
                id: app.keyId,
                name: app.name,
                default: Boolean(app.default),
            },
            files,
            storage,
            maxStorage: maxStorageFor(user),
        };
        return {
            content: [
                { type: "text" as const, text: JSON.stringify(response) },
            ],
            structuredContent: response,
        };
    } catch {
        return INTERNAL_ERROR;
    }
}
