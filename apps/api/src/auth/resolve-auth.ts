import { Apikey } from "@medialit/models";
import { getApiKeyByUserId, getApiKeyUsingKeyId } from "../apikey/queries";
import { validateBearerToken } from "../oauth/middleware";
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
    | { status: "missing" };

export function sendAuthError(res: any, auth: AuthResult): boolean {
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

export async function resolveAuth(
    input: AuthInput,
    dependencies: AuthDependencies = defaultDependencies,
): Promise<AuthResult> {
    const authorization = getHeaderValue(input.authorization);
    if (authorization) {
        const match = authorization.match(/^Bearer (.+)$/i);
        if (match) {
            const claims = await dependencies.validateBearerToken(match[1]);
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
                apiKey: await getEffectiveOAuthApiKey(
                    claims.userId,
                    dependencies,
                ),
            };
        }
    }

    const submittedApiKey =
        getHeaderValue(input.bodyApiKey) || getHeaderValue(input.apiKeyHeader);
    if (!submittedApiKey) return { status: "missing" };

    const apiKey = await dependencies.getApiKeyUsingKeyId(submittedApiKey);
    if (!apiKey) return { status: "unauthorized" };

    const userId = apiKey.userId.toString();
    const user = await dependencies.getUser(userId);
    if (!user) return { status: "unauthorized" };

    return {
        status: "authenticated",
        kind: "apikey",
        user,
        userId,
        apiKey: submittedApiKey,
    };
}
