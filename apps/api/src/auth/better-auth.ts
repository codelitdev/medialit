import { createTransport } from "nodemailer";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { createOAuthProviderOptions } from "@codelitdev/oauth-server-kit/better-auth";
import type { HostedLoginMethod } from "@codelitdev/oauth-server-kit/express";
import { getDb } from "../config/db";
import * as schema from "../db/schema";
import logger from "../services/log";
import { ensureUserForAuth } from "../user/queries";

export const webClientUrl = process.env.WEB_CLIENT || "http://localhost:3000";
export const authBasePath = "/api/auth";
export const authBaseUrl =
    process.env.API_PUBLIC_URL ||
    process.env.BETTER_AUTH_URL ||
    `http://localhost:${process.env.PORT || 8000}`;
export const authIssuer = `${authBaseUrl}${authBasePath}`;
export const validOAuthAudiences = [authBaseUrl];
export const oauthScopes = [
    "openid",
    "profile",
    "email",
    "offline_access",
] as const;

export const hostedLoginMethods: HostedLoginMethod[] = [{ type: "email-otp" }];
const authCookieDomain = process.env.AUTH_COOKIE_DOMAIN;

function authSchema() {
    return {
        user: schema.authUsers,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
        jwks: schema.authJwks,
        oauthClient: schema.oauthProviderClients,
        oauthAccessToken: schema.oauthProviderAccessTokens,
        oauthRefreshToken: schema.oauthProviderRefreshTokens,
        oauthConsent: schema.oauthProviderConsents,
        oauthClientAssertion: schema.oauthProviderClientAssertions,
    };
}

async function sendOtpEmail(email: string, otp: string): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
        logger.info({ email, otp }, "[Dev] Better Auth OTP generated");
        return;
    }
    if (!process.env.EMAIL_HOST) {
        throw new Error("EMAIL_HOST is required to send login OTPs");
    }

    const transporter = createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT) || 587,
        auth: process.env.EMAIL_USER
            ? {
                  user: process.env.EMAIL_USER,
                  pass: process.env.EMAIL_PASS || "",
              }
            : undefined,
    });
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Your MediaLit verification code",
        text: `Enter this code to sign in to MediaLit: ${otp}`,
        html: `<p>Enter this code to sign in to MediaLit:</p><h2>${otp}</h2>`,
    });
}

function createAuth() {
    return betterAuth({
        appName: "MediaLit",
        baseURL: authBaseUrl,
        basePath: authBasePath,
        secret: process.env.BETTER_AUTH_SECRET || process.env.OAUTH_SIGNING_KEY,
        database: drizzleAdapter(getDb(), {
            provider: "pg",
            schema: authSchema(),
        }),
        trustedOrigins: [webClientUrl, authBaseUrl],
        advanced: authCookieDomain
            ? {
                  crossSubDomainCookies: {
                      enabled: true,
                      domain: authCookieDomain,
                  },
              }
            : undefined,
        session: {
            expiresIn: 60 * 60 * 24 * 30,
            updateAge: 60 * 60 * 24,
        },
        databaseHooks: {
            user: {
                create: {
                    async after(user) {
                        await ensureUserForAuth({
                            id: user.id,
                            email: user.email,
                            name: user.name,
                        });
                    },
                },
            },
        },
        plugins: [
            emailOTP({
                async sendVerificationOTP({ email, otp }) {
                    await sendOtpEmail(email, otp);
                },
                storeOTP: "hashed",
                expiresIn: 5 * 60,
                allowedAttempts: 5,
                rateLimit: { window: 60, max: 3 },
            }),
            jwt(),
            oauthProvider({
                ...createOAuthProviderOptions({
                    loginPage: `${authBaseUrl}/oauth/login`,
                    consentPage: `${authBaseUrl}/oauth/consent`,
                    allowDynamicClientRegistration: true,
                    allowUnauthenticatedDynamicClientRegistration: true,
                    scopes: oauthScopes,
                    validAudiences: validOAuthAudiences,
                }),
                accessTokenExpiresIn:
                    Number(process.env.TOKEN_TTL_SECONDS) || 900,
                refreshTokenExpiresIn: 60 * 60 * 24 * 30,
                codeExpiresIn: 5 * 60,
            }),
        ],
    });
}

type Auth = ReturnType<typeof createAuth>;

let authInstance: Auth | undefined;
let resourceClient: any;

export function initializeAuth(): Auth {
    if (!authInstance) {
        authInstance = createAuth();
        resourceClient = oauthProviderResourceClient(authInstance);
    }
    return authInstance;
}

export function getAuth(): Auth {
    if (!authInstance) {
        throw new Error("Authentication has not been initialized");
    }
    return authInstance;
}

export function getOAuthResourceClient(): any {
    if (!resourceClient) {
        throw new Error("Authentication has not been initialized");
    }
    return resourceClient;
}

export async function ensureWebOAuthClient(): Promise<void> {
    const now = new Date();
    await getDb()
        .insert(schema.oauthProviderClients)
        .values({
            id: "medialit-web-client",
            clientId: "web-client",
            name: "MediaLit web",
            redirectUris: [`${webClientUrl}/api/auth/callback/medialit`],
            grantTypes: ["authorization_code", "refresh_token"],
            responseTypes: ["code"],
            tokenEndpointAuthMethod: "none",
            public: true,
            requirePKCE: true,
            skipConsent: true,
            scopes: [...oauthScopes],
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: schema.oauthProviderClients.clientId,
            set: {
                redirectUris: [`${webClientUrl}/api/auth/callback/medialit`],
                updatedAt: now,
            },
        });
}
