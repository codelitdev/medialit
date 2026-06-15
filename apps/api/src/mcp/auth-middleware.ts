import { Response, NextFunction } from "express";
import apikeyMiddleware from "../apikey/middleware";
import { validateBearerToken } from "../oauth/middleware";
import { getApiKeyByUserId } from "../apikey/queries";

/**
 * Unified MCP auth middleware.
 *
 * Checks Authorization: Bearer <token> first (OAuth path),
 * then falls back to x-medialit-apikey header (API key path).
 *
 * Both paths populate `req.userId` before handing off to the MCP transport.
 */
export async function mcpAuth(
    req: any,
    res: Response,
    next: NextFunction,
): Promise<void> {
    // Path A: OAuth Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const match = authHeader.match(/^Bearer (.+)$/i);
        if (match) {
            const bearer = match[1];
            const claims = await validateBearerToken(bearer);
            if (!claims) {
                res.status(401).json({
                    error: "invalid_token",
                    error_description: "Access token is invalid or expired",
                });
                return;
            }
            const userId = claims.userId;
            req.userId = userId;
            req.clientId = claims.clientId;
            req.scopes = claims.scopes;
            // Look up the user's first API key so tool handlers can use it
            try {
                const keys = await getApiKeyByUserId(userId);
                const firstKey = Array.isArray(keys) ? keys[0] : keys;
                if (firstKey) req.apikey = (firstKey as any).key;
            } catch {
                // continue without apikey — tool handlers will return Unauthorized
            }
            return next();
        }
        // If Authorization header exists but isn't Bearer, continue to API key check
    }

    // Path B: API key
    const apiKey = req.headers["x-medialit-apikey"];
    if (apiKey) {
        // Delegate to existing apikey middleware
        // The middleware sets req.user and req.apikey
        return apikeyMiddleware(req, res, (err?: any) => {
            if (err) return next(err);
            // apikey middleware populates req.user — map to userId
            if (req.user) {
                req.userId = String(req.user._id || req.user.id || "");
            }
            next();
        });
    }

    // No auth provided
    res.status(401).json({
        error: "unauthorized",
        error_description:
            "Missing authentication: provide Authorization: Bearer <token> or x-medialit-apikey header",
    });
}
