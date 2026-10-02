import { verifyOAuthAccessToken } from "@codelitdev/oauth-server-kit";
import { verifyAccessToken as verifyLegacyAccessToken } from "../oauth/jwt";
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

export async function validateBearerToken(
    bearer: string,
): Promise<BearerClaims | null> {
    const legacy = verifyLegacyAccessToken(bearer);
    if (legacy) {
        return {
            userId: legacy.sub,
            clientId: legacy.cid,
            scopes: legacy.scope,
        };
    }
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
