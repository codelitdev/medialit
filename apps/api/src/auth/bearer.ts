import { verifyOAuthAccessToken } from "@codelitdev/oauth-server-kit";
import type { MedialitAuth } from "./better-auth";
import { APP_ID_CLAIM } from "./oauth-app-selection";

export type BearerClaims = {
    userId: string;
    clientId: string;
    scopes: string[];
    /** The app picked at authorization; absent on tokens issued before the
     * app picker existed. */
    appId?: string;
};

/** Reads a string claim from a token the kit has already verified. The kit's
 * identity omits custom claims, and opaque tokens carry none. */
function verifiedJwtClaim(token: string, name: string): string | undefined {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    try {
        const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf8"),
        );
        const value = payload?.[name];
        return typeof value === "string" && value.length > 0
            ? value
            : undefined;
    } catch {
        return undefined;
    }
}

let kitAuth: MedialitAuth | null = null;

export function setBearerAuth(auth: MedialitAuth): void {
    kitAuth = auth;
}

export function getMcpResourceMetadataUrl(): string | undefined {
    return kitAuth
        ? `${kitAuth.publicApiUrl}/.well-known/oauth-protected-resource/mcp`
        : undefined;
}

export async function validateBearerToken(
    bearer: string,
): Promise<BearerClaims | null> {
    if (!kitAuth) return null;
    const result = await verifyOAuthAccessToken(
        {
            oauthResourceClient: kitAuth.oauthResourceClient,
            issuer: kitAuth.issuer,
            audiences: [
                kitAuth.restResource,
                kitAuth.mcpResource,
                kitAuth.publicApiUrl,
            ],
        },
        bearer,
    );
    if (result.status !== "authenticated") return null;
    const { identity } = result;
    return {
        userId: identity.subject,
        clientId: identity.method === "oauth" ? identity.clientId : "",
        scopes: [...identity.scopes],
        appId: verifiedJwtClaim(bearer, APP_ID_CLAIM),
    };
}
