import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export type MedialitMcpAuthExtra = {
    authKind: "oauth" | "apikey";
    /** Internal id of the authenticated account. */
    userId: string;
    user: any;
    /** The app's API key. OAuth requests act on the app picked at
     * authorization; API-key requests act on the key's own app. */
    apikey: string;
};

export type MedialitMcpAuthInfo = AuthInfo & {
    extra: MedialitMcpAuthExtra;
};

type McpAuthRequest = {
    authKind?: unknown;
    userId?: unknown;
    clientId?: unknown;
    apikey?: unknown;
    scopes?: unknown;
    user?: any;
};

/** Builds the auth info the MCP transport hands to tool handlers from the
 * fields `mcpAuth` sets on the request. */
export function createMcpAuthInfo(input: unknown): MedialitMcpAuthInfo | null {
    if (!input || typeof input !== "object") return null;
    const req = input as McpAuthRequest;
    if (
        (req.authKind !== "oauth" && req.authKind !== "apikey") ||
        typeof req.userId !== "string" ||
        !req.userId ||
        typeof req.apikey !== "string" ||
        !req.apikey ||
        !req.user
    ) {
        return null;
    }
    const scopes = Array.isArray(req.scopes)
        ? req.scopes.filter(
              (scope): scope is string => typeof scope === "string",
          )
        : [];
    const clientId =
        req.authKind === "oauth" && typeof req.clientId === "string"
            ? req.clientId
            : "apikey";
    return {
        // The SDK requires a token. Never put a credential secret here.
        token: `${req.authKind}:${clientId}`,
        clientId,
        scopes,
        extra: {
            authKind: req.authKind,
            userId: req.userId,
            user: req.user,
            apikey: req.apikey,
        },
    };
}

/** The authenticated account and app for a tool call, or `null`. */
export function getMcpAuth(extra: any): MedialitMcpAuthExtra | null {
    const auth = extra?.authInfo?.extra as MedialitMcpAuthExtra | undefined;
    if (
        !auth ||
        (auth.authKind !== "oauth" && auth.authKind !== "apikey") ||
        !auth.userId ||
        !auth.apikey ||
        !auth.user
    ) {
        return null;
    }
    return auth;
}
