import { Router, type Request, type Response } from "express";
import { isLegacyTokenRevoked, revokeLegacyToken } from "@/db";
import {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    ACCESS_TOKEN_TTL_SECONDS,
} from "../oauth/jwt";
import { getUser } from "../user/queries";
import { validateBearerToken } from "./bearer";
import type { MedialitAuth } from "./better-auth";

async function forward(
    auth: MedialitAuth,
    path: string,
    req: Request,
    res: Response,
) {
    const url = new URL(path, auth.publicApiUrl);
    const query = req.originalUrl.includes("?")
        ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
        : "";
    if (query) {
        const params = new URLSearchParams(query.slice(1));
        params.forEach((value, key) => url.searchParams.set(key, value));
    }
    const entries = Object.entries(req.body || {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    const body =
        req.method === "GET" || req.method === "HEAD"
            ? undefined
            : entries.length > 0
              ? new URLSearchParams(entries).toString()
              : typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body ?? {});
    const headers = new Headers();
    const contentType = req.headers["content-type"];
    if (typeof contentType === "string")
        headers.set("content-type", contentType);
    else if (body)
        headers.set("content-type", "application/x-www-form-urlencoded");
    if (typeof req.headers.authorization === "string") {
        headers.set("authorization", req.headers.authorization);
    }
    const response = await auth.auth.handler(
        new Request(url, {
            method: req.method,
            headers,
            body,
        }),
    );
    res.status(response.status);
    const responseType = response.headers.get("content-type");
    if (responseType) res.setHeader("content-type", responseType);
    res.send(await response.text());
}

export function legacyOAuthRouter(auth: MedialitAuth) {
    const router = Router();

    router.get("/oauth/authorize", (req, res) => {
        const query = req.originalUrl.includes("?")
            ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
            : "";
        res.redirect(302, `/api/auth/oauth2/authorize${query}`);
    });

    router.post("/oauth/token", async (req, res) => {
        const grant = req.body?.grant_type;
        const refreshToken = req.body?.refresh_token;
        if (grant === "refresh_token" && typeof refreshToken === "string") {
            const payload = verifyRefreshToken(refreshToken);
            if (payload?.jti) {
                if (await isLegacyTokenRevoked(payload.jti)) {
                    res.status(400).json({ error: "invalid_grant" });
                    return;
                }
                await revokeLegacyToken({
                    jti: payload.jti,
                    userId: payload.sub,
                    clientId: payload.cid,
                    expiresAt: new Date((payload.exp || 0) * 1000),
                });
                res.json({
                    access_token: signAccessToken(
                        payload.sub,
                        payload.cid,
                        payload.scope,
                    ),
                    refresh_token: signRefreshToken(payload.sub, payload.cid),
                    token_type: "Bearer",
                    expires_in: ACCESS_TOKEN_TTL_SECONDS,
                });
                return;
            }
        }
        await forward(auth, "/api/auth/oauth2/token", req, res);
    });

    router.post("/oauth/register", async (req, res) => {
        await forward(auth, "/api/auth/oauth2/register", req, res);
    });

    router.post("/oauth/revoke", async (req, res) => {
        const token = req.body?.token;
        if (typeof token === "string") {
            const payload = verifyRefreshToken(token);
            if (payload?.jti) {
                await revokeLegacyToken({
                    jti: payload.jti,
                    userId: payload.sub,
                    clientId: payload.cid,
                    expiresAt: new Date((payload.exp || 0) * 1000),
                });
                res.status(200).json({});
                return;
            }
        }
        await forward(auth, "/api/auth/oauth2/revoke", req, res);
    });

    router.get("/oauth/userinfo", async (req, res) => {
        const header = req.headers.authorization || "";
        const match = header.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            res.status(401).json({
                error: "invalid_token",
                error_description: "Missing or invalid authorization header.",
            });
            return;
        }
        const claims = await validateBearerToken(match[1]!);
        if (!claims) {
            res.status(401).json({
                error: "invalid_token",
                error_description: "Access token is invalid or expired.",
            });
            return;
        }
        const user = await getUser(claims.userId);
        if (!user) {
            res.status(401).json({
                error: "invalid_token",
                error_description: "User not found.",
            });
            return;
        }
        res.json({
            sub: String(user._id || user.id),
            email: user.email,
            name: user.name || "",
        });
    });

    return router;
}
