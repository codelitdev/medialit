import { NextFunction, Response } from "express";
import { getMcpResourceMetadataUrl } from "./bearer";
import { AuthResult, resolveAuth, sendAuthError } from "./resolve-auth";
import { API_KEY_SCOPES } from "./scopes";

type AuthResolver = (input: {
    authorization?: unknown;
    apiKeyHeader?: unknown;
    bodyApiKey?: unknown;
}) => Promise<AuthResult>;

type AuthMiddlewareMode = "rest" | "mcp";

function applyAuthToRequest(
    req: any,
    auth: AuthResult,
    mode: AuthMiddlewareMode,
) {
    if (auth.status !== "authenticated") return;

    req.user = auth.user;
    req.apikey = auth.apiKey;
    req.scopes = auth.kind === "oauth" ? auth.scopes : API_KEY_SCOPES;

    if (mode === "mcp") {
        req.authKind = auth.kind;
        req.userId = auth.userId;
        if (auth.kind === "oauth") {
            req.clientId = auth.clientId;
        }
    }
}

export function createAuthMiddleware(
    mode: AuthMiddlewareMode,
    authResolver: AuthResolver = resolveAuth,
) {
    return async function authMiddleware(
        req: any,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        const auth = await authResolver({
            authorization: req.headers.authorization,
            apiKeyHeader: req.headers["x-medialit-apikey"],
            bodyApiKey: req.body?.apikey,
        });

        if (
            sendAuthError(
                res,
                auth,
                mode === "mcp" ? getMcpResourceMetadataUrl() : undefined,
            )
        )
            return;
        if (auth.status !== "authenticated") return;

        applyAuthToRequest(req, auth, mode);
        next();
    };
}

export const apikey = createAuthMiddleware("rest");
export const mcpAuth = createAuthMiddleware("mcp");
