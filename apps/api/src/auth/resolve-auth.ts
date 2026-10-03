import {
    PLATFORM_ERROR_HTTP_STATUS,
    PLATFORM_ERROR_MESSAGES,
    type PresentedCredential,
    selectSingleCredential,
} from "@codelitdev/platform";
import { Apikey } from "@medialit/models";
import { getApiKeyByUserId, getApiKeyUsingKeyId } from "../apikey/queries";
import { validateBearerToken } from "./bearer";
import { getUser } from "../user/queries";

type UserRecord = any;

type OAuthClaims = {
    userId: string;
    clientId: string;
    scopes: string[];
};

export type AuthInput = {
    authorization?: unknown;
    apiKeyHeader?: unknown;
    bodyApiKey?: unknown;
};

export type AuthDependencies = {
    validateBearerToken: (bearer: string) => Promise<OAuthClaims | null>;
    getUser: (id: string) => Promise<UserRecord | null>;
    getApiKeyByUserId: (userId: string) => Promise<Apikey | Apikey[] | null>;
    getApiKeyUsingKeyId: (key: string) => Promise<Apikey | null>;
};

export type AuthResult =
    | {
          status: "authenticated";
          kind: "oauth";
          user: UserRecord;
          userId: string;
          clientId: string;
          scopes: string[];
          apiKey?: string;
      }
    | {
          status: "authenticated";
          kind: "apikey";
          user: UserRecord;
          userId: string;
          apiKey: string;
      }
    | { status: "invalid_token" }
    | { status: "unauthorized" }
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
    getApiKeyByUserId,
    getApiKeyUsingKeyId,
};

function getHeaderValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
}

export function selectEffectiveApiKey(
    keys: Apikey | Apikey[] | null,
): Apikey | null {
    if (!keys) return null;
    if (!Array.isArray(keys)) return keys;
    return keys.find((key) => key.default === true) || keys[0] || null;
}

async function getEffectiveOAuthApiKey(
    userId: string,
    dependencies: AuthDependencies,
): Promise<string | undefined> {
    try {
        const keys = await dependencies.getApiKeyByUserId(userId);
        return selectEffectiveApiKey(keys)?.key;
    } catch {
        return undefined;
    }
}

/**
 * Follows the Platform credential contract (ADR 0001): a request carries
 * exactly one mechanism, and a malformed or invalid credential is rejected
 * rather than falling back to another one.
 */
export async function resolveAuth(
    input: AuthInput,
    dependencies: AuthDependencies = defaultDependencies,
): Promise<AuthResult> {
    const authorization = getHeaderValue(input.authorization);
    const headerApiKey = getHeaderValue(input.apiKeyHeader);
    const bodyApiKey = getHeaderValue(input.bodyApiKey);

    let bearer: string | undefined;
    if (authorization) {
        const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
        if (!match) return { status: "invalid_token" };
        bearer = match[1];
    }
    // The header and the legacy body field are one mechanism; two different
    // keys are ambiguous.
    if (headerApiKey && bodyApiKey && headerApiKey !== bodyApiKey) {
        return { status: "ambiguous" };
    }

    const presented: PresentedCredential[] = [];
    if (bearer) presented.push({ kind: "oauth", secret: bearer });
    const submittedApiKey = bodyApiKey || headerApiKey;
    if (submittedApiKey) {
        presented.push({ kind: "api_key", secret: submittedApiKey });
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

        return {
            status: "authenticated",
            kind: "oauth",
            user,
            userId: claims.userId,
            clientId: claims.clientId,
            scopes: claims.scopes,
            apiKey: await getEffectiveOAuthApiKey(claims.userId, dependencies),
        };
    }

    const submitted = selection.credential.secret;
    const apiKey = await dependencies.getApiKeyUsingKeyId(submitted);
    if (!apiKey) return { status: "unauthorized" };

    const userId = apiKey.userId.toString();
    const user = await dependencies.getUser(userId);
    if (!user) return { status: "unauthorized" };

    return {
        status: "authenticated",
        kind: "apikey",
        user,
        userId,
        apiKey: submitted,
    };
}
