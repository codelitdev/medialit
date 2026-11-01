import { oauthProvider } from "@better-auth/oauth-provider";
import { cimd } from "@better-auth/cimd";
import { createOAuthProviderOptions } from "@codelitdev/oauth-server-kit/better-auth";
import type { BetterAuthOptions } from "better-auth";
import { captcha } from "better-auth/plugins";
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

// The hosted login page sends the email-OTP request here. The code itself
// is only checked after the person proves they got the email, so this is the
// request bots abuse to send mail.
export const CAPTCHA_PROTECTED_ENDPOINTS = ["/email-otp/send-verification-otp"];

// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const TURNSTILE_TESTING_SECRET = /^[123]x0{31}AA$/;

export interface LoginCaptchaConfig {
    siteKey: string;
    secretKey: string;
}

/**
 * Cloudflare Turnstile for the hosted login page. Off unless both keys are
 * set; one key without the other is a misconfiguration, not "off".
 */
export function loginCaptchaConfig(
    env: Record<string, string | undefined> = process.env,
): LoginCaptchaConfig | undefined {
    const siteKey = env.TURNSTILE_SITE_KEY?.trim();
    const secretKey = env.TURNSTILE_SECRET_KEY?.trim();
    if (!siteKey && !secretKey) {
        return undefined;
    }
    if (!siteKey || !secretKey) {
        throw new Error(
            "TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be set together",
        );
    }
    return { siteKey, secretKey };
}

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
    // The sign-in page lives on the API host, but the dashboard reads the
    // session cookie on its own host. Set this to the shared parent domain
    // (for example `medialit.cloud`) when the two are different subdomains.
    const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
    const loginCaptcha = loginCaptchaConfig();
    return {
        appName: "MediaLit",
        baseURL: urls.publicApiUrl,
        basePath: AUTH_BASE_PATH,
        secret: input.secret,
        trustedOrigins: [urls.webOrigin, urls.publicApiUrl, ...extraOrigins],
        advanced: {
            cookiePrefix: AUTH_COOKIE_PREFIX,
            ...(cookieDomain
                ? {
                      crossSubDomainCookies: {
                          enabled: true,
                          domain: cookieDomain,
                      },
                  }
                : {}),
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
            ...(loginCaptcha
                ? [
                      captcha({
                          provider: "cloudflare-turnstile",
                          secretKey: loginCaptcha.secretKey,
                          endpoints: CAPTCHA_PROTECTED_ENDPOINTS,
                          // The widget only renders on the API's login page.
                          // Cloudflare's testing secrets always report
                          // example.com, so they skip this check.
                          ...(TURNSTILE_TESTING_SECRET.test(
                              loginCaptcha.secretKey,
                          )
                              ? {}
                              : {
                                    allowedHostnames: [
                                        new URL(urls.publicApiUrl).hostname,
                                    ],
                                }),
                      }),
                  ]
                : []),
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
