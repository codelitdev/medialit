import { verifyAccessToken } from "./jwt";

export async function validateBearerToken(
    bearer: string,
): Promise<{ userId: string; clientId: string; scopes: string[] } | null> {
    const payload = verifyAccessToken(bearer);
    if (!payload) return null;
    return {
        userId: payload.sub,
        clientId: payload.cid,
        scopes: payload.scope,
    };
}
