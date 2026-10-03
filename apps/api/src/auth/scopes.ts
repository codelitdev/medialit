import type { NextFunction, Response } from "express";
import { DATA_READ_SCOPE, DATA_WRITE_SCOPE } from "./options";

export type DataScope = typeof DATA_READ_SCOPE | typeof DATA_WRITE_SCOPE;

// API keys predate scopes and keep full access to their account.
export const API_KEY_SCOPES: readonly string[] = [
    DATA_READ_SCOPE,
    DATA_WRITE_SCOPE,
];

/** MCP tools declare `readOnlyHint`; anything not read-only needs write. */
export function toolScope(readOnlyHint: boolean | undefined): DataScope {
    return readOnlyHint === true ? DATA_READ_SCOPE : DATA_WRITE_SCOPE;
}

export function hasScope(
    scopes: readonly string[] | undefined,
    scope: DataScope,
): boolean {
    return Boolean(scopes?.includes(scope));
}

export function insufficientScopeMessage(scope: DataScope): string {
    return `This token lacks the ${scope} scope. Re-authorize the client to grant it.`;
}

/** Run after the auth middleware, which sets `req.scopes`. */
export function requireScope(scope: DataScope) {
    return (req: any, res: Response, next: NextFunction): void => {
        if (hasScope(req.scopes, scope)) {
            next();
            return;
        }
        res.setHeader(
            "WWW-Authenticate",
            `Bearer error="insufficient_scope", scope="${scope}"`,
        );
        res.status(403).json({
            error: "insufficient_scope",
            error_description: insufficientScopeMessage(scope),
        });
    };
}
