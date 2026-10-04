import { oauthProvider } from "@better-auth/oauth-provider";
import { cimd } from "@better-auth/cimd";
import { createOAuthProviderOptions } from "@codelitdev/oauth-server-kit/better-auth";
import type { BetterAuthOptions } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { jwt } from "better-auth/plugins/jwt";
import { ensureProfile } from "@/db";
import { sendSignInCode } from "../services/mail";
import logger from "../services/log";
import { fetchClientMetadataResource } from "./cimd-fetch";
import { SELECT_APP_PATH } from "./oauth-app-pages";
import {
    createOAuthAppSelectionHooks,
    oauthAppSelectionAdapter,
} from "./oauth-app-selection";

export const AUTH_BASE_PATH = "/api/auth";
export const AUTH_COOKIE_PREFIX = "medialit";
export const DATA_READ_SCOPE = "data:read";
export const DATA_WRITE_SCOPE = "data:write";
// Advertised to MCP clients, which request exactly these scopes.
// `offline_access` gets them a refresh token instead of re-consenting
// every time the access token expires.
export const MCP_SCOPES_SUPPORTED = [
    DATA_READ_SCOPE,
    DATA_WRITE_SCOPE,
    "offline_access",
] as const;

export function authUrls(publicApiUrl: string, webOrigin?: string) {
    const normalized = publicApiUrl.replace(/\/$/, "");
    return {
        publicApiUrl: normalized,
        webOrigin: (webOrigin ?? normalized).replace(/\/$/, ""),
        issuer: `${normalized}${AUTH_BASE_PATH}`,
        restResource: `${normalized}/media`,
        mcpResource: `${normalized}/mcp`,
    };
}

export function medialitAuthOptions(input: {
    publicApiUrl: string;
    secret: string;
    webOrigin?: string;
    database?: BetterAuthOptions["database"];
}): BetterAuthOptions {
    // The return type stops `betterAuth()` from inferring a unique plugin
    // type. That inference exhausts the typechecker heap.
    const urls = authUrls(input.publicApiUrl, input.webOrigin);
    const extraOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    return {
        appName: "MediaLit",
        baseURL: urls.publicApiUrl,
        basePath: AUTH_BASE_PATH,
        secret: input.secret,
        trustedOrigins: [urls.webOrigin, urls.publicApiUrl, ...extraOrigins],
        advanced: {
            cookiePrefix: AUTH_COOKIE_PREFIX,
        },
        emailAndPassword: { enabled: false },
        ...(input.database ? { database: input.database } : {}),
        databaseHooks: {
            user: {
                create: {
                    after: async (created: { id: string }) => {
                        try {
                            await ensureProfile({ userId: created.id });
                        } catch (error) {
                            logger.error(
                                { error },
                                "Failed to provision user profile",
                            );
                        }
                    },
                },
            },
        },
        plugins: [
            jwt(),
            emailOTP({
                async sendVerificationOTP({ email, otp }) {
                    await sendSignInCode(email, otp);
                },
            }),
            oauthProvider({
                ...createOAuthProviderOptions({
                    loginPage: `${urls.publicApiUrl}/oauth/login`,
                    consentPage: `${urls.publicApiUrl}/oauth/consent`,
                    scopes: [
                        "openid",
                        "profile",
                        "email",
                        "offline_access",
                        DATA_READ_SCOPE,
                        DATA_WRITE_SCOPE,
                    ],
                    validAudiences: [
                        urls.restResource,
                        urls.mcpResource,
                        urls.publicApiUrl,
                    ],
                    allowDynamicClientRegistration: true,
                    allowUnauthenticatedDynamicClientRegistration: true,
                    clientRegistrationDefaultScopes: [
                        "openid",
                        "profile",
                        "email",
                    ],
                    clientRegistrationAllowedScopes: [
                        "offline_access",
                        DATA_READ_SCOPE,
                        DATA_WRITE_SCOPE,
                    ],
                }),
                clientRegistrationDefaultResources: [urls.mcpResource],
                ...createOAuthAppSelectionHooks({
                    page: `${urls.publicApiUrl}${SELECT_APP_PATH}`,
                    adapter: oauthAppSelectionAdapter,
                }),
            }),
            cimd({
                fetchClientMetadataResource,
                metadataProfile: "mcp-2026-07-28",
                metadataRevalidationInterval: "60m",
                metadataFetchPolicy: {
                    minimumFetchInterval: 0,
                },
                originBoundFields: ["post_logout_redirect_uris", "client_uri"],
            }),
        ],
    };
}
