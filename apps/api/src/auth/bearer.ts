import { verifyOAuthAccessToken } from "@codelitdev/oauth-server-kit";
import type { MedialitAuth } from "./better-auth";

export type BearerClaims = {
    userId: string;
    clientId: string;
    scopes: string[];
};

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
    };
}
