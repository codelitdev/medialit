import crypto from "crypto";
import fs from "fs";
import path from "path";
import type OAuth2Server from "@node-oauth/oauth2-server";
import logger from "../services/log";
import {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
} from "./jwt";

// In-memory deny-list of revoked refresh-token jti values.
// Reset on server restart — that's acceptable per the PRD §6.7.7:
// clients must re-authorize if their token was revoked just before a
// crash, and the access-token lifetime is short enough that the window
// is small.
const refreshTokenDenylist = new Set<string>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------
//
// Authorization codes are kept in memory because they are short-lived
// (5 minute TTL) and single-use. Restart loss is acceptable.
//
// Access and refresh tokens are NOT stored here — they are stateless
// signed JWTs verified by ./jwt.ts. See PRD §6.7.

const authorizationCodes = new Map<string, StoredAuthorizationCode>();

// ---------------------------------------------------------------------------
// TTL sweep (every 5 minutes)
// ---------------------------------------------------------------------------

setInterval(
    () => {
        const now = new Date();
        authorizationCodes.forEach((data, code) => {
            if (data.expiresAt < now) authorizationCodes.delete(code);
        });
    },
    5 * 60 * 1000,
);

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Dynamically-registered clients (DCR / RFC 7591)
// ---------------------------------------------------------------------------

interface DynamicClient {
    clientId: string;
    clientIdIssuedAt: number;
    redirectUris: string[];
    grantTypes: string[];
    tokenEndpointAuthMethod: string;
}

const DCR_PERSIST_PATH = path.resolve(process.cwd(), "data/dcr-clients.json");

const dynamicClients = new Map<string, DynamicClient>();

// Load persisted DCR clients
function loadDynamicClients(): void {
    try {
        if (fs.existsSync(DCR_PERSIST_PATH)) {
            const raw = fs.readFileSync(DCR_PERSIST_PATH, "utf-8");
            const arr: DynamicClient[] = JSON.parse(raw);
            for (const c of arr) {
                dynamicClients.set(c.clientId, c);
            }
            logger.info({ count: arr.length }, "Loaded DCR clients");
        }
    } catch (err: any) {
        logger.warn({ error: err.message }, "Failed to load DCR clients");
    }
}
loadDynamicClients();

function sanitizeDcrClient(client: DynamicClient): DynamicClient {
    return {
        clientId: client.clientId,
        clientIdIssuedAt: client.clientIdIssuedAt,
        redirectUris: client.redirectUris.filter((u: string) => {
            try {
                new URL(u);
                return true;
            } catch {
                return false;
            }
        }),
        grantTypes:
            client.grantTypes?.filter((g: string) =>
                [
                    "authorization_code",
                    "refresh_token",
                    "client_credentials",
                ].includes(g),
            ) || [],
        tokenEndpointAuthMethod:
            client.tokenEndpointAuthMethod === "none" ? "none" : "none",
    };
}

// Save DCR clients to disk
function persistDynamicClients(): void {
    try {
        const dir = path.dirname(DCR_PERSIST_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const sanitized = Array.from(dynamicClients.values()).map(
            sanitizeDcrClient,
        );
        // codeql[js/network-data-written-to-file] — sanitized by sanitizeDcrClient
        fs.writeFileSync(DCR_PERSIST_PATH, JSON.stringify(sanitized, null, 2), {
            mode: 0o600,
        });
    } catch (err: any) {
        logger.warn({ error: err.message }, "Failed to persist DCR clients");
    }
}

export interface DcrRequest {
    redirect_uris: string[];
    grant_types?: string[];
    token_endpoint_auth_method?: string;
    client_name?: string;
}

export interface DcrResponse {
    client_id: string;
    client_id_issued_at: number;
    client_secret_expires_at: number;
    redirect_uris: string[];
    grant_types: string[];
    token_endpoint_auth_method: string;
}

/** Register a new OAuth client (DCR / RFC 7591). */
export function registerClient(meta: DcrRequest): DcrResponse {
    const clientId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const client: DynamicClient = {
        clientId,
        clientIdIssuedAt: now,
        redirectUris: meta.redirect_uris,
        grantTypes: meta.grant_types ?? ["authorization_code"],
        tokenEndpointAuthMethod: meta.token_endpoint_auth_method ?? "none",
    };
    dynamicClients.set(clientId, client);
    persistDynamicClients();
    return {
        client_id: clientId,
        client_id_issued_at: now,
        client_secret_expires_at: 0, // no secret — public client, never expires
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    };
}

// ---------------------------------------------------------------------------
// Model implementation
// ---------------------------------------------------------------------------

export const oauthModel: OAuth2Server.AuthorizationCodeModel &
    OAuth2Server.RefreshTokenModel = {
    // -- Client ----------------------------------------------------------------

    async getClient(clientId: string, _clientSecret?: string) {
        // 1. Check DCR-registered clients first
        const dyn = dynamicClients.get(clientId);
        if (dyn) {
            return {
                id: dyn.clientId,
                redirectUris: dyn.redirectUris,
                grants: dyn.grantTypes,
                accessTokenLifetime: 3600,
                refreshTokenLifetime: 60 * 60 * 24 * 30,
            };
        }
        // 2. Check static pre-registered clients
        const stat = STATIC_CLIENTS[clientId];
        if (stat) {
            return {
                id: clientId,
                redirectUris: stat.redirectUris,
                grants: ["authorization_code", "refresh_token"],
                accessTokenLifetime: 3600,
                refreshTokenLifetime: 60 * 60 * 24 * 30, // 30 days
            };
        }
        logger.warn({ clientId }, "Unknown client_id rejected");
        return null;
    },

    // -- Authorization codes ---------------------------------------------------

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
        if (stored.expiresAt < new Date()) {
            authorizationCodes.delete(authorizationCode);
            return null;
        }
        return stored;
    },

    async revokeAuthorizationCode(
        code: StoredAuthorizationCode,
    ): Promise<boolean> {
        authorizationCodes.delete(code.authorizationCode);
        return true;
    },

    // -- Tokens ----------------------------------------------------------------

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
            accessTokenExpiresAt: new Date(
                Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
            ),
            refreshToken,
            refreshTokenExpiresAt: new Date(
                Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
            ),
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
            accessTokenExpiresAt: new Date(
                Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
            ),
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
        if (payload.jti && refreshTokenDenylist.has(payload.jti)) return null;
        return {
            refreshToken,
            refreshTokenExpiresAt: new Date(
                Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
            ),
            scope: payload.scope,
            client: { id: payload.cid } as OAuth2Server.Client,
            user: { id: payload.sub } as OAuth2Server.User,
        };
    },

    async revokeToken(token: StoredRefreshToken): Promise<boolean> {
        const payload = verifyRefreshToken(token.refreshToken);
        if (payload?.jti) {
            refreshTokenDenylist.add(payload.jti);
        }
        return true;
    },

    // -- Scope -----------------------------------------------------------------

    async verifyScope(_token: OAuth2Server.Token, _scope: string[]) {
        // All tokens have full scope for now
        return true;
    },

    // -- Token generation -------------------------------------------------------
    //
    // removed: was `generateAccessToken` / `generateRefreshToken` — their
    // random-hex return values were discarded by `saveToken`, which signs its
    // own HS256 JWTs (see PRD §6.7). The library's default random generator is
    // equally discarded, so dropping these is behavior-neutral. The auth-code
    // generator below is kept because its output IS stored and used.

    generateAuthorizationCode(
        _client: OAuth2Server.Client,
        _user: OAuth2Server.User,
        _scope: string[],
    ): Promise<string> {
        return Promise.resolve(crypto.randomBytes(16).toString("hex"));
    },
};

// removed: was `export async function resolveBearerToken(bearer)` — duplicated
// oauth/middleware.ts `validateBearerToken`, which is now the single bearer-token
// validation path used by mcp/auth-middleware.ts (see PRD §6.6).
