import {
    PLATFORM_ERROR_HTTP_STATUS,
    PLATFORM_ERROR_MESSAGES,
    type PresentedCredential,
    selectSingleCredential,
} from "@codelitdev/platform";
import { getApiKeyBySecret } from "../apikey/queries";
import { listApps, type ApiKeyAuthRecord, type AppRecord } from "@/db";
import { validateBearerToken } from "./bearer";
import { getUser } from "../user/queries";

type UserRecord = any;

type OAuthClaims = {
    userId: string;
    clientId: string;
    scopes: string[];
    /** Public app ID from the token's `app_id` claim. */
    appId?: string;
};

export type AuthInput = {
    authorization?: unknown;
    apiKeyHeader?: unknown;
};

export type AuthDependencies = {
    validateBearerToken: (bearer: string) => Promise<OAuthClaims | null>;
    getUser: (id: string) => Promise<UserRecord | null>;
    /** The user's apps that aren't deleted, optionally by public ID. */
    listApps: (userId: string, appId?: string) => Promise<AppRecord[]>;
    getApiKeyBySecret: (secret: string) => Promise<ApiKeyAuthRecord | null>;
};

export type AuthResult =
    | {
          status: "authenticated";
          kind: "oauth";
          user: UserRecord;
          userId: string;
          clientId: string;
          scopes: string[];
          /** Internal ID of the app the token acts on, if the user has one. */
          appId?: string;
      }
    | {
          status: "authenticated";
          kind: "apikey";
          user: UserRecord;
          userId: string;
          /** Internal ID of the key's app. */
          appId: string;
          /** Internal ID of the key. Never the secret. */
          apiKeyId: string;
      }
    | { status: "invalid_token" }
    | { status: "unauthorized" }
    | { status: "forbidden"; error: "account_inactive" }
    | { status: "ambiguous" }
    | { status: "missing" };

export function sendAuthError(
    res: any,
    auth: AuthResult,
    resourceMetadataUrl?: string,
): boolean {
    if (auth.status !== "authenticated" && resourceMetadataUrl) {
        res.setHeader(
            "WWW-Authenticate",
            `Bearer resource_metadata="${resourceMetadataUrl}"`,
        );
    }
    if (auth.status === "invalid_token") {
        res.status(401).json({
            error: "invalid_token",
            error_description: "Access token is invalid or expired",
        });
        return true;
    }

    if (auth.status === "missing") {
        res.status(401).json({
            error: "unauthorized",
            error_description:
                "Missing authentication: provide Authorization: Bearer <token> or x-medialit-apikey header",
        });
        return true;
    }

    if (auth.status === "unauthorized") {
        res.status(401).json({ error: "unauthorized" });
        return true;
    }

    if (auth.status === "forbidden") {
        res.status(403).json({
            error: auth.error,
            error_description: "This account is deactivated",
        });
        return true;
    }

    if (auth.status === "ambiguous") {
        res.status(PLATFORM_ERROR_HTTP_STATUS.credential_ambiguous).json({
            error: "credential_ambiguous",
            error_description: PLATFORM_ERROR_MESSAGES.credential_ambiguous,
        });
        return true;
    }

    return false;
}

const defaultDependencies: AuthDependencies = {
    validateBearerToken,
    getUser,
    listApps,
    getApiKeyBySecret,
};

function getHeaderValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
}

export function selectEffectiveApp(apps: AppRecord[]): AppRecord | null {
    return apps.find((app) => app.default) || apps[0] || null;
}

/**
 * The internal ID of the app an OAuth token acts on: the one picked at
 * authorization, or the user's default app for tokens issued before the picker
 * existed. `null` means the picked app no longer exists.
 */
async function getEffectiveOAuthApp(
    userId: string,
    appId: string | undefined,
    dependencies: AuthDependencies,
): Promise<string | undefined | null> {
    try {
        if (appId) {
            const [app] = await dependencies.listApps(userId, appId);
            return app && app.appId === appId ? app.id : null;
        }
        return selectEffectiveApp(await dependencies.listApps(userId))?.id;
    } catch {
        return undefined;
    }
}

const ACCOUNT_INACTIVE = {
    status: "forbidden",
    error: "account_inactive",
} as const;

/**
 * Follows the Platform credential contract (ADR 0001): a request carries
 * exactly one mechanism, and a malformed or invalid credential is rejected
 * rather than falling back to another one. API keys come only from the
 * `x-medialit-apikey` header.
 */
export async function resolveAuth(
    input: AuthInput,
    dependencies: AuthDependencies = defaultDependencies,
): Promise<AuthResult> {
    const authorization = getHeaderValue(input.authorization);
    const headerApiKey = getHeaderValue(input.apiKeyHeader);

    let bearer: string | undefined;
    if (authorization) {
        const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
        if (!match) return { status: "invalid_token" };
        bearer = match[1];
    }

    const presented: PresentedCredential[] = [];
    if (bearer) presented.push({ kind: "oauth", secret: bearer });
    if (headerApiKey) {
        presented.push({ kind: "api_key", secret: headerApiKey });
    }
    const selection = selectSingleCredential(presented);
    if (selection.kind === "absent") return { status: "missing" };
    if (selection.kind === "ambiguous") return { status: "ambiguous" };
    // The header was already parsed above; treat a malformed selection the
    // same way as a malformed Authorization header.
    if (selection.kind === "malformed") return { status: "invalid_token" };

    if (selection.credential.kind === "oauth") {
        const claims = await dependencies.validateBearerToken(
            selection.credential.secret,
        );
        if (!claims) return { status: "invalid_token" };

        const user = await dependencies.getUser(claims.userId);
        if (!user) return { status: "unauthorized" };
        if (user.active === false) return ACCOUNT_INACTIVE;

        const appId = await getEffectiveOAuthApp(
            claims.userId,
            claims.appId,
            dependencies,
        );
        // The picked app was deleted; the client must re-authorize and pick
        // another rather than silently act on a different app.
        if (appId === null) return { status: "invalid_token" };

        return {
            status: "authenticated",
            kind: "oauth",
            user,
            userId: claims.userId,
            clientId: claims.clientId,
            scopes: claims.scopes,
            appId,
        };
    }

    const found = await dependencies.getApiKeyBySecret(
        selection.credential.secret,
    );
    if (!found) return { status: "unauthorized" };

    const userId = found.app.userId;
    const user = await dependencies.getUser(userId);
    if (!user) return { status: "unauthorized" };
    if (!found.ownerActive || user.active === false) return ACCOUNT_INACTIVE;

    return {
        status: "authenticated",
        kind: "apikey",
        user,
        userId,
        appId: found.app.id,
        apiKeyId: found.key.id,
    };
}
