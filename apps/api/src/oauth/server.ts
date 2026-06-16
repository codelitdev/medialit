import { Router, Request as ExpressReq, Response as ExpressRes } from "express";
import { z } from "zod";
import OAuth2Server from "@node-oauth/oauth2-server";
import type { OauthPendingAuth as PendingAuthRecord } from "@medialit/models";
import { DcrValidationError, oauthModel, registerClient } from "./model";
import type { DcrRequest, DcrResponse } from "./model";
import { authorizePage, errorPage } from "./authorize-page";
import { findByEmail, createUser, getUser } from "../user/queries";
import { verifyAccessToken } from "./jwt";
import logger from "../services/log";
import OauthPendingAuth from "./pending-auth-model";
import {
    authorizeLimiter,
    registerLimiter,
    revokeLimiter,
    tokenLimiter,
    userinfoLimiter,
    verifyOtpLimiter,
} from "./limiters";
import {
    generateOtp,
    generatePendingId,
    hashOtp,
    MAX_OTP_ATTEMPTS,
    OTP_TTL_MS,
    OTP_RESEND_COOLDOWN_MS,
    PENDING_AUTH_TTL_MS,
    redirectUriMatchesRegistered,
    reqHeadersHost,
    singleQueryParam,
} from "./helpers";

const oauth = new OAuth2Server({
    model: oauthModel,
    allowEmptyState: true,
    allowExtendedTokenAttributes: true,
    accessTokenLifetime: Number(process.env.TOKEN_TTL_SECONDS) || 900,
    refreshTokenLifetime: 60 * 60 * 24 * 30, // 30 days
    authorizationCodeLifetime: 5 * 60, // 5 min
    requireClientAuthentication: {
        authorization_code: false,
        refresh_token: false,
    },
    alwaysIssueNewRefreshToken: true,
});

export const oauthRouter = Router();

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

oauthRouter.get(
    "/oauth/authorize",
    authorizeLimiter,
    async (req: ExpressReq, res: ExpressRes) => {
        try {
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

            const client = await oauthModel.getClient(q.client_id, "");
            if (!client) {
                return errorPage(res, "Invalid client_id.");
            }

            const uris = client.redirectUris as string[] | undefined;
            if (uris && uris.length > 0) {
                const matched = redirectUriMatchesRegistered(
                    q.redirect_uri,
                    uris,
                );
                if (!matched) {
                    return errorPage(
                        res,
                        "redirect_uri does not match registered client.",
                    );
                }
            }

            const pendingId = generatePendingId();
            await OauthPendingAuth.create({
                clientId: q.client_id,
                redirectUri: q.redirect_uri,
                codeChallenge: q.code_challenge,
                codeChallengeMethod: q.code_challenge_method,
                state: q.state,
                scope: q.scope,
                pendingId,
                expiresAt: new Date(Date.now() + PENDING_AUTH_TTL_MS),
            });

            res.type("html").send(authorizePage(pendingId, q.client_id));
        } catch (err: any) {
            logger.error({ error: err.message }, "OAuth authorize page error");
            errorPage(res, "An error occurred. Please try again.");
        }
    },
);

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
            if (
                !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(String(email).slice(0, 320))
            ) {
                return res.json({
                    success: false,
                    error: "Invalid email address",
                });
            }

            const pending = (await OauthPendingAuth.findOne({
                pendingId: String(pendingId),
                expiresAt: { $gt: new Date() },
            }).lean()) as PendingAuthRecord | null;
            if (!pending) {
                return res.json({
                    success: false,
                    error: "Authorization session expired. Please go back and try again.",
                });
            }

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

            const otp = generateOtp();
            const emailValue = String(email);
            await OauthPendingAuth.updateOne(
                { pendingId: String(pendingId) },
                {
                    $set: {
                        email: emailValue,
                        otpHash: hashOtp(String(pendingId), otp),
                        otpExpires: new Date(Date.now() + OTP_TTL_MS),
                        otpSentAt: new Date(),
                        otpAttempts: 0,
                    },
                },
            );

            if (process.env.NODE_ENV !== "production") {
                logger.info({ email: emailValue, otp }, "[Dev] OTP generated");
                return res.json({ success: true, otp });
            } else {
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

            const pending = (await OauthPendingAuth.findOneAndUpdate(
                {
                    pendingId,
                    expiresAt: { $gt: new Date() },
                },
                { $inc: { otpAttempts: 1 } },
                { new: true },
            ).lean()) as PendingAuthRecord | null;
            if (!pending) {
                return res.json({
                    success: false,
                    error: "Session expired. Please restart authorization.",
                });
            }

            if ((pending.otpAttempts || 0) > MAX_OTP_ATTEMPTS) {
                await OauthPendingAuth.deleteOne({ pendingId });
                return res.json({
                    success: false,
                    error: "Too many attempts. Please restart authorization.",
                });
            }

            if (
                !pending.otpHash ||
                !pending.otpExpires ||
                pending.otpExpires < new Date()
            ) {
                await OauthPendingAuth.deleteOne({ pendingId });
                return res.json({
                    success: false,
                    error: "Code expired. Please restart authorization.",
                });
            }

            if (pending.otpHash !== hashOtp(pendingId, String(otp))) {
                return res.json({ success: false, error: "Invalid code." });
            }

            const email = pending.email!;
            let user = await findByEmail(email);
            if (!user) {
                user = await createUser(email, undefined, "subscribed");
            }
            const userId = String((user as any)._id || (user as any).id);

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

            const location = oauthRes.get("Location");
            if (!location) {
                throw new Error(
                    "No redirect URI returned from authorize handler",
                );
            }

            await OauthPendingAuth.deleteOne({ pendingId });

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

oauthRouter.post(
    "/oauth/token",
    tokenLimiter,
    async (req: ExpressReq, res: ExpressRes) => {
        try {
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

            const body = (oauthRes as any).body;
            if (!body) {
                throw new Error("No response from token handler");
            }

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

oauthRouter.get(
    "/oauth/userinfo",
    userinfoLimiter,
    async (req: ExpressReq, res: ExpressRes) => {
        try {
            const authParsed = z
                .object({
                    authorization: z
                        .string()
                        .regex(
                            /^Bearer\s+.+$/,
                            "Missing or invalid authorization header.",
                        ),
                })
                .safeParse({ authorization: req.headers.authorization });

            if (!authParsed.success) {
                return res.status(401).json({
                    error: "invalid_token",
                    error_description: authParsed.error.errors[0].message,
                });
            }
            const token = authParsed.data.authorization.substring(7);
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
    },
);

oauthRouter.post(
    "/oauth/revoke",
    revokeLimiter,
    async (req: ExpressReq, res: ExpressRes) => {
        try {
            const { token } = req.body || {};
            if (token) {
                const refreshToken = await oauthModel.getRefreshToken(token);
                if (refreshToken) {
                    await oauthModel.revokeToken(refreshToken);
                }
            }
            res.status(200).json({});
        } catch {
            res.status(200).json({});
        }
    },
);

oauthRouter.post(
    "/oauth/register",
    registerLimiter,
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
            const client = await registerClient(meta);
            res.status(201).json(client as DcrResponse);
        } catch (err: any) {
            if (err instanceof DcrValidationError) {
                res.status(400).json({
                    error: "invalid_client_metadata",
                    error_description: err.message,
                });
                return;
            }
            logger.error({ error: err.message }, "DCR error");
            res.status(500).json({
                error: "server_error",
                error_description: "Failed to register client.",
            });
        }
    },
);
