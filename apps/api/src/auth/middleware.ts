import { NextFunction, Response } from "express";
import { AuthResult, resolveAuth, sendAuthError } from "./resolve-auth";
import { API_KEY_SCOPES } from "./scopes";

type AuthResolver = (input: {
    authorization?: unknown;
    apiKeyHeader?: unknown;
}) => Promise<AuthResult>;

function applyAuthToRequest(req: any, auth: AuthResult) {
    if (auth.status !== "authenticated") return;

    req.user = auth.user;
    // Internal IDs only; no secret ever reaches the request.
    req.appId = auth.appId;
    req.apiKeyId = auth.kind === "apikey" ? auth.apiKeyId : undefined;
    req.scopes = auth.kind === "oauth" ? auth.scopes : API_KEY_SCOPES;
}

export function createAuthMiddleware(authResolver: AuthResolver = resolveAuth) {
    return async function authMiddleware(
        req: any,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        const auth = await authResolver({
            authorization: req.headers.authorization,
            apiKeyHeader: req.headers["x-medialit-apikey"],
        });

        if (sendAuthError(res, auth)) return;
        if (auth.status !== "authenticated") return;

        applyAuthToRequest(req, auth);
        next();
    };
}

export const apikey = createAuthMiddleware();
