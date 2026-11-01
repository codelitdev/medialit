import { AsyncLocalStorage } from "node:async_hooks";
import type { McpToolDefinition } from "@codelitdev/mcp-server-kit";
import {
    type AuthenticationResult,
    createPlatformError,
    type HeaderMap,
    type PlatformError,
} from "@codelitdev/platform";
import { type AuthResult, resolveAuth } from "../auth/resolve-auth";
import { API_KEY_SCOPES } from "../auth/scopes";

/** What every MediaLit MCP tool runs with. Internal IDs only; no credential
 * secret ever reaches a tool. */
export type MedialitMcpContext = {
    authKind: "oauth" | "apikey";
    /** Internal id of the authenticated account. */
    userId: string;
    user: any;
    /** Internal ID of the app. OAuth requests act on the app picked at
     * authorization; API-key requests act on the key's own app. */
    appId: string;
    /** Internal ID of the API key, for API-key requests only. Signatures
     * record it so revoking the key revokes them. */
    apiKeyId?: string;
    /** OAuth scopes granted to the token. API keys carry every data scope. */
    scopes: readonly string[];
};

export type MedialitMcpTool = McpToolDefinition<MedialitMcpContext>;

/** The kit hands `resolveContext` a principal id and credential only, so the
 * full auth result is kept for the request's duration here. */
const authByRequest = new AsyncLocalStorage<{ auth?: AuthResult }>();

export function runMcpRequest<T>(handle: () => Promise<T>): Promise<T> {
    return authByRequest.run({}, handle);
}

function headerValue(headers: HeaderMap, name: string): string | undefined {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
}

/** MCP accepts an OAuth bearer token or an API key. The route passes a
 * `x-medialit-apikey` key on as `X-API-Key`, the header the kit reads. */
export async function authenticateMcpRequest(
    headers: HeaderMap,
): Promise<AuthenticationResult<string>> {
    const auth = await resolveAuth({
        authorization: headerValue(headers, "authorization"),
        apiKeyHeader: headerValue(headers, "x-api-key"),
    });
    const store = authByRequest.getStore();
    if (store) store.auth = auth;

    switch (auth.status) {
        case "authenticated":
            return {
                kind: "authenticated",
                principalId: auth.userId,
                credential:
                    auth.kind === "oauth"
                        ? {
                              kind: "oauth",
                              credentialId: auth.clientId,
                              scopes: auth.scopes,
                          }
                        : { kind: "api_key", credentialId: auth.apiKeyId },
            };
        case "missing":
            return { kind: "absent" };
        case "ambiguous":
            return {
                kind: "rejected",
                error: createPlatformError("credential_ambiguous"),
            };
        case "forbidden":
            return {
                kind: "rejected",
                error: createPlatformError("forbidden", {
                    safeDetails: { reason: auth.error },
                }),
            };
        case "invalid_token":
            return {
                kind: "rejected",
                error: createPlatformError("unauthenticated", {
                    safeDetails: { reason: "invalid_token" },
                }),
            };
        default:
            return {
                kind: "rejected",
                error: createPlatformError("unauthenticated"),
            };
    }
}

export async function resolveMcpContext(): Promise<
    | { ok: true; context: MedialitMcpContext }
    | { ok: false; error: PlatformError }
> {
    const auth = authByRequest.getStore()?.auth;
    if (auth?.status !== "authenticated") {
        return { ok: false, error: createPlatformError("unauthenticated") };
    }
    // An OAuth token whose account has no app has nothing to act on.
    if (!auth.appId) {
        return {
            ok: false,
            error: createPlatformError("tenant_required", {
                safeDetails: { reason: "no_app" },
            }),
        };
    }
    return {
        ok: true,
        context: {
            authKind: auth.kind,
            userId: auth.userId,
            user: auth.user,
            appId: auth.appId,
            ...(auth.kind === "apikey" ? { apiKeyId: auth.apiKeyId } : {}),
            scopes: auth.kind === "oauth" ? auth.scopes : API_KEY_SCOPES,
        },
    };
}
