import { verifyAccessToken } from "./jwt";

/**
 * Generic Bearer token validator for any Express route.
 *
 * Returns `{ userId, clientId, scopes }` if the token is a valid
 * HS256-signed access JWT, or null if the signature is invalid,
 * the token is expired, or the type is not "access".
 *
 * Use this in any route handler that needs OAuth token validation.
 *
 * @example
 * ```typescript
 * import { validateBearerToken } from "../oauth/middleware";
 *
 * app.get("/api/protected", async (req, res) => {
 *     const auth = req.headers.authorization?.match(/^Bearer (.+)$/i);
 *     if (!auth) return res.status(401).json({ error: "unauthorized" });
 *     const claims = await validateBearerToken(auth[1]);
 *     if (!claims) return res.status(401).json({ error: "invalid_token" });
 *     // claims.userId, claims.clientId, claims.scopes available
 * });
 * ```
 */
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
