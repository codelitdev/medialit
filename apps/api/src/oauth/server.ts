import crypto from "crypto";
import { Router, Request as ExpressReq, Response as ExpressRes } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import OAuth2Server from "@node-oauth/oauth2-server";
import { oauthModel, registerClient } from "./model";
import type { DcrRequest, DcrResponse } from "./model";
import { authorizePage, errorPage } from "./authorize-page";
import { findByEmail, createUser, getUser } from "../user/queries";
import { verifyAccessToken } from "./jwt";
import logger from "../services/log";

// ---------------------------------------------------------------------------
// OAuth2Server instance
// ---------------------------------------------------------------------------

const oauth = new OAuth2Server({
    model: oauthModel,
    allowEmptyState: true,
    allowExtendedTokenAttributes: true,
    accessTokenLifetime: Number(process.env.MCP_TOKEN_TTL_SECONDS) || 3600,
    refreshTokenLifetime: 60 * 60 * 24 * 30, // 30 days
    authorizationCodeLifetime: 5 * 60, // 5 min
    requireClientAuthentication: {
        authorization_code: false,
        refresh_token: false,
    },
    alwaysIssueNewRefreshToken: true,
});

// ---------------------------------------------------------------------------
// Pending authorization stores
// ---------------------------------------------------------------------------

interface PendingAuth {
    clientId: string;
    redirectUri: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    state?: string;
    scope?: string;
    email?: string;
    otpHash?: string;
    otpExpires?: Date;
    otpAttempts?: number;
    otpSentAt?: Date;
}

const pendingAuths = new Map<string, PendingAuth>();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateOtp(): string {
    return String(Math.floor(100000 + crypto.randomInt(0, 900000)));
}

function hashOtp(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
}

function generatePendingId(): string {
    return crypto.randomBytes(16).toString("hex");
}

function sanitizeRedirectUri(uri: string): string {
    const idx = uri.indexOf("?");
    return idx >= 0 ? uri.substring(0, idx) : uri;
}

// Safely extract a scalar string from an Express query param, which may be
// string | string[] | ParsedQs | ParsedQs[] at runtime despite TypeScript types.
function singleQueryParam(val: unknown): string | undefined {
    if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : undefined;
    if (val === undefined || val === null) return undefined;
    return String(val);
}

// Rate limiters for authentication endpoints
const authorizeLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests, please try again later.",
    },
});

const verifyOtpLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests, please try again later.",
    },
});

const tokenLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many requests, please try again later.",
    },
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const oauthRouter = Router();

// --- Metadata endpoint -----------------------------------------------------

oauthRouter.get(
    "/.well-known/oauth-authorization-server",
    (_req: ExpressReq, res: ExpressRes) => {
        const host = reqHeadersHost(_req) || "localhost:8000";
        const baseUrl = host.includes("localhost")
            ? `http://${host}`
            : `https://${host}`;
        res.json({
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/oauth/authorize`,
            token_endpoint: `${baseUrl}/oauth/token`,
            revocation_endpoint: `${baseUrl}/oauth/revoke`,
            registration_endpoint: `${baseUrl}/oauth/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
        });
    },
);

// --- Authorization page ----------------------------------------------------

oauthRouter.get(
    "/oauth/authorize",
    authorizeLimiter,
    async (req: ExpressReq, res: ExpressRes) => {
        try {
            // Use singleQueryParam to handle string | string[] | undefined safely (CodeQL js/type-confusion-through-parameter-tampering)
            // Validate auth params via zod schema
            const parsed = z
                .object({
                    response_type: z.literal("code"),
                    client_id: z.string().min(1, "Missing client_id."),
                    redirect_uri: z.string().min(1, "Missing redirect_uri."),
                    code_challenge: z
                        .string()
                        .min(1, "Missing code_challenge (PKCE required)."),
                    code_challenge_method: z.string().optional(),
                    state: z.string().optional(),
                    scope: z.string().optional(),
                })
                .safeParse({
                    response_type: singleQueryParam(req.query.response_type),
                    client_id: singleQueryParam(req.query.client_id),
                    redirect_uri: singleQueryParam(req.query.redirect_uri),
                    code_challenge: singleQueryParam(req.query.code_challenge),
                    code_challenge_method: singleQueryParam(
                        req.query.code_challenge_method,
                    ),
                    state: singleQueryParam(req.query.state),
                    scope: singleQueryParam(req.query.scope),
                });

            if (!parsed.success) {
                return errorPage(res, parsed.error.errors[0].message);
            }

            const q = parsed.data;

            // Validate client
            const client = await oauthModel.getClient(q.client_id, "");
            if (!client) {
                return errorPage(res, "Invalid client_id.");
            }

            // Validate redirect URI against registered list.
            // For DCR/static clients with registered URIs: require exact match (after
            // stripping query params) to prevent open-redirect via prefix spoofing.
            // For public clients with no registered URIs: PKCE ensures the code can
            // only be exchanged by the original requester.
            const uris = client.redirectUris as string[] | undefined;
            if (uris && uris.length > 0) {
                const cleanUri = sanitizeRedirectUri(q.redirect_uri);
                const matched = uris.some((u) => cleanUri === u);
                if (!matched) {
                    return errorPage(
                        res,
                        "redirect_uri does not match registered client.",
                    );
                }
            }

            // Create pending auth session
            const pendingId = generatePendingId();
            pendingAuths.set(pendingId, {
                clientId: q.client_id,
                redirectUri: q.redirect_uri,
                codeChallenge: q.code_challenge,
                codeChallengeMethod: q.code_challenge_method,
                state: q.state,
                scope: q.scope,
            });

            // Clean up old pending auths
            setTimeout(() => pendingAuths.delete(pendingId), 10 * 60 * 1000);

            res.type("html").send(authorizePage(pendingId, q.client_id));
        } catch (err: any) {
            logger.error({ error: err.message }, "OAuth authorize page error");
            errorPage(res, "An error occurred. Please try again.");
        }
    },
);

// --- Send OTP --------------------------------------------------------------

oauthRouter.post(
    "/oauth/authorize/send-otp",
    async (req: ExpressReq, res: ExpressRes) => {
        try {
            const { pendingId, email } = req.body || {};
            if (!pendingId || !email) {
                return res.json({
                    success: false,
                    error: "Missing pendingId or email",
                });
            }
            if (!/^[0-9a-f]{32}$/.test(String(pendingId))) {
                return res.json({ success: false, error: "Invalid request" });
            }
            // Use [^\s@.] before the dot so the pre-dot part cannot match dots,
            // preventing polynomial backtracking on inputs with no dot in the domain
            // (CodeQL js/polynomial-redos).
            if (
                !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(String(email).slice(0, 320))
            ) {
                return res.json({
                    success: false,
                    error: "Invalid email address",
                });
            }

            const pending = pendingAuths.get(pendingId);
            if (!pending) {
                return res.json({
                    success: false,
                    error: "Authorization session expired. Please go back and try again.",
                });
            }

            const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
            if (
                pending.otpSentAt &&
                Date.now() - pending.otpSentAt.getTime() <
                    OTP_RESEND_COOLDOWN_MS
            ) {
                return res.json({
                    success: false,
                    error: "Please wait before requesting another code.",
                });
            }

            // Generate and hash OTP
            const otp = generateOtp();
            pending.email = String(email);
            pending.otpHash = hashOtp(otp);
            pending.otpExpires = new Date(Date.now() + OTP_TTL_MS);
            pending.otpSentAt = new Date();
            pending.otpAttempts = 0;

            if (process.env.NODE_ENV !== "production") {
                logger.info(
                    { email: pending.email, otp },
                    "[Dev] OTP generated",
                );
                return res.json({ success: true, otp });
            } else {
                // Try sending via nodemailer
                try {
                    const nodemailer = require("nodemailer");
                    if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
                        const transporter = nodemailer.createTransport({
                            host: process.env.EMAIL_HOST,
                            port: Number(process.env.EMAIL_PORT) || 587,
                            auth: {
                                user: process.env.EMAIL_USER,
                                pass: process.env.EMAIL_PASS,
                            },
                        });
                        await transporter.sendMail({
                            from: process.env.EMAIL_FROM,
                            to: email,
                            subject: "Your MediaLit verification code",
                            text: `Enter this code to authorize: ${otp}`,
                            html: `<p>Enter this code to authorize MediaLit access:</p><h2>${otp}</h2>`,
                        });
                    }
                } catch (mailErr: any) {
                    logger.error(
                        { email, error: mailErr.message },
                        "Failed to send OTP email",
                    );
                }
            }

            res.json({ success: true });
        } catch (err: any) {
            logger.error({ error: err.message }, "Send OTP error");
            res.json({
                success: false,
                error: "Failed to send verification code",
            });
        }
    },
);

// --- Verify OTP + generate authorization code ------------------------------

oauthRouter.post(
    "/oauth/authorize/verify-otp",
    verifyOtpLimiter,
    async (req: ExpressReq, res: ExpressRes) => {
        try {
            const parsed = z
                .object({
                    pendingId: z
                        .string()
                        .regex(/^[0-9a-f]{32}$/, "Invalid request"),
                    otp: z.string().regex(/^\d{6}$/, "Invalid code format"),
                })
                .safeParse(req.body || {});

            if (!parsed.success) {
                return res.json({
                    success: false,
                    error: parsed.error.errors[0].message,
                });
            }

            const { pendingId, otp } = parsed.data;

            const pending = pendingAuths.get(pendingId);
            if (!pending) {
                return res.json({
                    success: false,
                    error: "Session expired. Please restart authorization.",
                });
            }

            const MAX_OTP_ATTEMPTS = 5;
            pending.otpAttempts = (pending.otpAttempts || 0) + 1;
            if (pending.otpAttempts > MAX_OTP_ATTEMPTS) {
                pendingAuths.delete(pendingId);
                return res.json({
                    success: false,
                    error: "Too many attempts. Please restart authorization.",
                });
            }

            // Verify OTP
            if (
                !pending.otpHash ||
                !pending.otpExpires ||
                pending.otpExpires < new Date()
            ) {
                pendingAuths.delete(pendingId);
                return res.json({
                    success: false,
                    error: "Code expired. Please restart authorization.",
                });
            }

            if (pending.otpHash !== hashOtp(String(otp))) {
                return res.json({ success: false, error: "Invalid code." });
            }

            // OTP verified — find or create user
            const email = pending.email!;
            let user = await findByEmail(email);
            if (!user) {
                user = await createUser(email, undefined, "subscribed");
            }
            const userId = String((user as any)._id || (user as any).id);

            // Clean up OTP data (single-use)
            delete pending.otpHash;
            delete pending.otpExpires;

            // Create the library Request/Response and call authorize
            const oauthReq = new OAuth2Server.Request({
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    ...Object.fromEntries(
                        Object.entries(req.headers).map(([k, v]) => [
                            k,
                            String(v),
                        ]),
                    ),
                },
                method: "POST",
                query: {} as Record<string, string>,
                body: {
                    response_type: "code",
                    client_id: pending.clientId,
                    redirect_uri: pending.redirectUri,
                    scope: pending.scope,
                    state: pending.state,
                    code_challenge: pending.codeChallenge,
                    code_challenge_method: pending.codeChallengeMethod,
                },
            });

            const oauthRes = new OAuth2Server.Response({});

            await oauth.authorize(oauthReq, oauthRes, {
                authenticateHandler: {
                    handle: () => Promise.resolve({ id: userId, email }),
                },
            });

            // Get the redirect URL from the library response
            const location = oauthRes.get("Location");
            if (!location) {
                throw new Error(
                    "No redirect URI returned from authorize handler",
                );
            }

            // Clean up pending auth
            pendingAuths.delete(pendingId);

            res.json({ success: true, redirectUri: location });
        } catch (err: any) {
            logger.error({ error: err.message }, "Verify OTP error");
            res.json({
                success: false,
                error: "Verification failed. Please try again.",
            });
        }
    },
);

// --- Token endpoint --------------------------------------------------------

oauthRouter.post(
    "/oauth/token",
    tokenLimiter,
    async (req: ExpressReq, res: ExpressRes) => {
        try {
            // Build the request with form-encoded body params
            const oauthReq = new OAuth2Server.Request({
                headers: {
                    "content-type":
                        req.headers["content-type"] ||
                        "application/x-www-form-urlencoded",
                    ...Object.fromEntries(
                        Object.entries(req.headers).map(([k, v]) => [
                            k,
                            String(v),
                        ]),
                    ),
                },
                method: "POST",
                query: {} as Record<string, string>,
                body: req.body || {},
            });

            const oauthRes = new OAuth2Server.Response({});

            await oauth.token(oauthReq, oauthRes);

            // The library writes to oauthRes.body — send it back
            const body = (oauthRes as any).body;
            if (!body) {
                throw new Error("No response from token handler");
            }

            // Ensure CORS headers
            res.set(oauthRes.headers || {});
            res.status(oauthRes.status || 200).json(body);
        } catch (err: any) {
            logger.error({ error: err.message }, "Token exchange error");
            if (err instanceof OAuth2Server.OAuthError) {
                res.status(err.code || 400).json({
                    error: err.name,
                    error_description: err.message,
                });
            } else {
                res.status(500).json({
                    error: "server_error",
                    error_description: "An unexpected error occurred.",
                });
            }
        }
    },
);

// --- UserInfo endpoint -----------------------------------------------------

oauthRouter.get("/oauth/userinfo", async (req: ExpressReq, res: ExpressRes) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "invalid_token",
                error_description: "Missing or invalid authorization header.",
            });
        }
        const token = authHeader.substring(7);
        const payload = verifyAccessToken(token);
        if (!payload) {
            return res.status(401).json({
                error: "invalid_token",
                error_description: "Access token is invalid or expired.",
            });
        }
        const user = await getUser(payload.sub);
        if (!user) {
            return res.status(401).json({
                error: "invalid_token",
                error_description: "User not found.",
            });
        }
        res.json({
            sub: String(user._id || user.id),
            email: user.email,
            name: user.name || "",
        });
    } catch (err: any) {
        logger.error({ error: err.message }, "UserInfo endpoint error");
        res.status(500).json({
            error: "server_error",
            error_description: "An unexpected error occurred.",
        });
    }
});

// --- Revoke endpoint -------------------------------------------------------

oauthRouter.post("/oauth/revoke", async (req: ExpressReq, res: ExpressRes) => {
    try {
        const { token } = req.body || {};
        if (token) {
            // Try to revoke the token
            const refreshToken = await oauthModel.getRefreshToken(token);
            if (refreshToken) {
                await oauthModel.revokeToken(refreshToken);
            }
        }
        // Always return 200 per RFC 7009
        res.status(200).json({});
    } catch {
        res.status(200).json({});
    }
});

// --- DCR endpoint (RFC 7591) -----------------------------------------------

oauthRouter.post(
    "/oauth/register",
    async (req: ExpressReq, res: ExpressRes) => {
        try {
            const meta = req.body as DcrRequest;
            if (
                !meta.redirect_uris ||
                !Array.isArray(meta.redirect_uris) ||
                meta.redirect_uris.length === 0
            ) {
                res.status(400).json({
                    error: "invalid_redirect_uri",
                    error_description: "At least one redirect_uri is required.",
                });
                return;
            }
            const client = registerClient(meta);
            res.status(201).json(client as DcrResponse);
        } catch (err: any) {
            logger.error({ error: err.message }, "DCR error");
            res.status(500).json({
                error: "server_error",
                error_description: "Failed to register client.",
            });
        }
    },
);

// ---------------------------------------------------------------------------
// Helper: get the host from the request (handles X-Forwarded-Host behind Tailscale Funnel)
// ---------------------------------------------------------------------------

function reqHeadersHost(req: ExpressReq): string | null {
    // Tailscale Funnel sets X-Forwarded-Host
    const forwarded = req.headers["x-forwarded-host"];
    if (forwarded) return Array.isArray(forwarded) ? forwarded[0] : forwarded;
    // Standard host header
    const host = req.headers.host;
    if (host) return Array.isArray(host) ? host[0] : host;
    return null;
}
