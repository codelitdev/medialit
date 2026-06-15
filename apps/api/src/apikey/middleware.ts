import { BAD_REQUEST, UNAUTHORISED } from "../config/strings";
import { getApiKeyUsingKeyId, getApiKeyByUserId } from "./queries";
import { getUser } from "../user/queries";
import { validateBearerToken } from "../oauth/middleware";
import { Apikey } from "@medialit/models";
import logger from "../services/log";

export default async function apikey(
    req: any,
    res: any,
    next: (...args: any[]) => void,
) {
    // 1. Try OAuth Bearer token first
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const match = authHeader.match(/^Bearer (.+)$/i);
        if (match) {
            const bearer = match[1];
            const claims = await validateBearerToken(bearer);
            if (!claims) {
                return res.status(401).json({
                    error: UNAUTHORISED,
                    error_description: "Access token is invalid or expired.",
                });
            }
            req.user = await getUser(claims.userId);
            if (!req.user) {
                return res.status(401).json({ error: UNAUTHORISED });
            }
            // Populate req.apikey with user's first API key for backward-compatibility
            try {
                const keys = await getApiKeyByUserId(claims.userId);
                const firstKey = Array.isArray(keys) ? keys[0] : keys;
                if (firstKey) {
                    req.apikey = (firstKey as any).key;
                }
            } catch {
                // Ignore key lookup failure
            }
            return next();
        }
    }

    // 2. Fall back to standard API Key auth
    const reqKey = req.body?.apikey || req.headers["x-medialit-apikey"];

    if (!reqKey) {
        logger.error({}, "API key is missing");
        return res.status(401).json({ error: UNAUTHORISED });
    }

    const apiKey: Apikey | null = await getApiKeyUsingKeyId(reqKey);
    if (!apiKey) {
        return res.status(401).json({ error: UNAUTHORISED });
    }

    req.user = await getUser(apiKey!.userId.toString());
    req.apikey = apiKey.key;

    next();
}
