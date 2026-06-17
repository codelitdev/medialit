import crypto from "crypto";
import type OAuth2Server from "@node-oauth/oauth2-server";
import logger from "../services/log";
import OauthClient from "./client-model";
import OauthRevokedToken from "./revoked-token-model";
import {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
} from "./jwt";

interface StoredAuthorizationCode {
    authorizationCode: string;
    expiresAt: Date;
    redirectUri: string;
    scope?: string[];
    client: OAuth2Server.Client;
    user: OAuth2Server.User;
    codeChallenge?: string;
    codeChallengeMethod?: string;
}

interface StoredAccessToken {
    accessToken: string;
    accessTokenExpiresAt?: Date;
    scope?: string[];
    client: OAuth2Server.Client;
    user: OAuth2Server.User;
}

interface StoredRefreshToken {
    refreshToken: string;
    refreshTokenExpiresAt?: Date;
    scope?: string[];
    client: OAuth2Server.Client;
    user: OAuth2Server.User;
}

const authorizationCodes = new Map<string, StoredAuthorizationCode>();

const authorizationCodeSweep = setInterval(
    () => {
        const now = new Date();
        authorizationCodes.forEach((data, code) => {
            if (data.expiresAt < now) authorizationCodes.delete(code);
        });
    },
    5 * 60 * 1000,
);
authorizationCodeSweep.unref?.();

const STATIC_CLIENTS: Record<string, { redirectUris: string[] }> = {
    "web-client": {
        redirectUris: [
            `${process.env.WEB_CLIENT || "http://localhost:3000"}/api/auth/callback/medialit`,
        ].filter((uri): uri is string => !!uri),
    },
    "mobile-app": {
        redirectUris: ["medialit://oauth/callback"],
    },
};

interface DynamicClient {
    clientId: string;
    clientIdIssuedAt: number;
    redirectUris: string[];
    grantTypes: string[];
    tokenEndpointAuthMethod: string;
    clientName?: string;
    scope?: string;
}

export class DcrValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DcrValidationError";
    }
}

const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;
const ALLOWED_DCR_GRANTS = ["authorization_code", "refresh_token"];

function isLoopbackRedirect(url: URL): boolean {
    return (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]" ||
        url.hostname === "::1"
    );
}

function validateRedirectUri(uri: unknown): string {
    if (typeof uri !== "string") {
        throw new DcrValidationError("redirect_uri must be a string");
    }

    if (uri.length > MAX_REDIRECT_URI_LENGTH) {
        throw new DcrValidationError("redirect_uri is too long");
    }

    let parsed: URL;
    try {
        parsed = new URL(uri);
    } catch {
        throw new DcrValidationError("redirect_uri must be a valid URL");
    }

    if (parsed.hash) {
        throw new DcrValidationError(
            "redirect_uri must not contain a fragment",
        );
    }

    if (parsed.username || parsed.password) {
        throw new DcrValidationError(
            "redirect_uri must not contain credentials",
        );
    }

    if (parsed.protocol !== "https:") {
        if (parsed.protocol !== "http:" || !isLoopbackRedirect(parsed)) {
            throw new DcrValidationError(
                "redirect_uri must use HTTPS unless it is localhost or loopback",
            );
        }
    }

    return parsed.toString();
}

function validateGrantTypes(grantTypes?: unknown): string[] {
    const grants = grantTypes ?? ["authorization_code"];
    if (!Array.isArray(grants) || grants.length === 0) {
        throw new DcrValidationError("grant_types must be a non-empty array");
    }
    const invalid = grants.find((grant) => !ALLOWED_DCR_GRANTS.includes(grant));
    if (invalid) {
        throw new DcrValidationError(`Unsupported grant_type: ${invalid}`);
    }
    return grants;
}

function validateTokenEndpointAuthMethod(method: string): "none" {
    if (method !== "none") {
        throw new DcrValidationError("token_endpoint_auth_method must be none");
    }
    return "none";
}

function sanitizeDcrClient(client: DynamicClient): DynamicClient {
    if (!Array.isArray(client.redirectUris)) {
        throw new DcrValidationError("redirect_uris must be an array");
    }

    if (client.redirectUris.length === 0) {
        throw new DcrValidationError("At least one redirect_uri is required");
    }

    if (client.redirectUris.length > MAX_REDIRECT_URIS) {
        throw new DcrValidationError("Too many redirect_uris");
    }

    return {
        clientId: client.clientId,
        clientIdIssuedAt: client.clientIdIssuedAt,
        redirectUris: client.redirectUris.map(validateRedirectUri),
        grantTypes: validateGrantTypes(client.grantTypes),
        tokenEndpointAuthMethod: validateTokenEndpointAuthMethod(
            client.tokenEndpointAuthMethod,
        ),
        clientName: client.clientName,
        scope: client.scope,
    };
}

export interface DcrRequest {
    redirect_uris: string[];
    grant_types?: string[];
    token_endpoint_auth_method?: string;
    client_name?: string;
    scope?: string;
}

export interface DcrResponse {
    client_id: string;
    client_id_issued_at: number;
    client_secret_expires_at: number;
    redirect_uris: string[];
    grant_types: string[];
    token_endpoint_auth_method: string;
    client_name?: string;
    scope?: string;
}

export async function registerClient(meta: DcrRequest): Promise<DcrResponse> {
    const clientId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const client: DynamicClient = {
        clientId,
        clientIdIssuedAt: now,
        redirectUris: meta.redirect_uris,
        grantTypes: meta.grant_types ?? ["authorization_code"],
        tokenEndpointAuthMethod: meta.token_endpoint_auth_method ?? "none",
        clientName: meta.client_name,
        scope: meta.scope,
    };
    const sanitized = sanitizeDcrClient(client);
    await OauthClient.create(sanitized);
    return {
        client_id: sanitized.clientId,
        client_id_issued_at: sanitized.clientIdIssuedAt,
        client_secret_expires_at: 0,
        redirect_uris: sanitized.redirectUris,
        grant_types: sanitized.grantTypes,
        token_endpoint_auth_method: sanitized.tokenEndpointAuthMethod,
        client_name: sanitized.clientName,
        scope: sanitized.scope,
    };
}

export const oauthModel: OAuth2Server.AuthorizationCodeModel &
    OAuth2Server.RefreshTokenModel = {
    async getClient(clientId: string, _clientSecret?: string) {
        const dyn = (await OauthClient.findOne({
            clientId,
        }).lean()) as DynamicClient | null;
        if (dyn) {
            return {
                id: dyn.clientId,
                redirectUris: dyn.redirectUris,
                grants: dyn.grantTypes,
                accessTokenLifetime: ACCESS_TOKEN_TTL_SECONDS,
                refreshTokenLifetime: 60 * 60 * 24 * 30,
            };
        }
        const stat = STATIC_CLIENTS[clientId];
        if (stat) {
            return {
                id: clientId,
                redirectUris: stat.redirectUris,
                grants: ["authorization_code", "refresh_token"],
                accessTokenLifetime: ACCESS_TOKEN_TTL_SECONDS,
                refreshTokenLifetime: 60 * 60 * 24 * 30, // 30 days
            };
        }
        logger.warn({ clientId }, "Unknown client_id rejected");
        return null;
    },

    async saveAuthorizationCode(
        code: Pick<
            StoredAuthorizationCode,
            | "authorizationCode"
            | "expiresAt"
            | "redirectUri"
            | "scope"
            | "codeChallenge"
            | "codeChallengeMethod"
        >,
        client: OAuth2Server.Client,
        user: OAuth2Server.User,
    ): Promise<StoredAuthorizationCode> {
        const stored: StoredAuthorizationCode = {
            authorizationCode: code.authorizationCode,
            expiresAt: code.expiresAt,
            redirectUri: code.redirectUri,
            scope: code.scope,
            client,
            user,
            codeChallenge: code.codeChallenge,
            codeChallengeMethod: code.codeChallengeMethod,
        };
        authorizationCodes.set(code.authorizationCode, stored);
        return stored;
    },

    async getAuthorizationCode(
        authorizationCode: string,
    ): Promise<StoredAuthorizationCode | null> {
        const stored = authorizationCodes.get(authorizationCode);
        if (!stored) return null;
        return stored;
    },

    async revokeAuthorizationCode(
        code: StoredAuthorizationCode,
    ): Promise<boolean> {
        authorizationCodes.delete(code.authorizationCode);
        return true;
    },

    async saveToken(
        token: Partial<OAuth2Server.Token>,
        client: OAuth2Server.Client,
        user: OAuth2Server.User,
    ): Promise<OAuth2Server.Token> {
        const userId = String((user as any).id);
        const clientId = String((client as any).id);
        const scope = token.scope;

        const accessToken = signAccessToken(userId, clientId, scope);
        const refreshToken = signRefreshToken(userId, clientId);

        return {
            accessToken,
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            refreshToken,
            refreshTokenExpiresAt: token.refreshTokenExpiresAt,
            scope,
            client,
            user,
            custom: { userId },
        };
    },

    async getAccessToken(
        accessToken: string,
    ): Promise<StoredAccessToken | null> {
        const payload = verifyAccessToken(accessToken);
        if (!payload) return null;
        return {
            accessToken,
            accessTokenExpiresAt: payload.exp
                ? new Date(payload.exp * 1000)
                : new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
            scope: payload.scope,
            client: { id: payload.cid } as OAuth2Server.Client,
            user: { id: payload.sub } as OAuth2Server.User,
        };
    },

    async getRefreshToken(
        refreshToken: string,
    ): Promise<StoredRefreshToken | null> {
        const payload = verifyRefreshToken(refreshToken);
        if (!payload) return null;
        if (payload.jti) {
            const revoked = await OauthRevokedToken.findOne({
                jti: payload.jti,
            }).lean();
            if (revoked) return null;
        }
        return {
            refreshToken,
            refreshTokenExpiresAt: payload.exp
                ? new Date(payload.exp * 1000)
                : new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
            scope: payload.scope,
            client: { id: payload.cid } as OAuth2Server.Client,
            user: { id: payload.sub } as OAuth2Server.User,
        };
    },

    async revokeToken(token: StoredRefreshToken): Promise<boolean> {
        const payload = verifyRefreshToken(token.refreshToken);
        if (payload?.jti) {
            await OauthRevokedToken.updateOne(
                { jti: payload.jti },
                {
                    $setOnInsert: {
                        jti: payload.jti,
                        tokenType: "refresh_token",
                        userId: payload.sub,
                        clientId: payload.cid,
                        expiresAt: payload.exp
                            ? new Date(payload.exp * 1000)
                            : (token.refreshTokenExpiresAt ??
                              new Date(
                                  Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
                              )),
                        revokedAt: new Date(),
                    },
                },
                { upsert: true },
            );
        }
        return true;
    },

    async verifyScope(_token: OAuth2Server.Token, _scope: string[]) {
        return true;
    },
};
